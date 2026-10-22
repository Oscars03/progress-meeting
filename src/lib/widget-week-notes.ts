import { weekKey, weekStartDate } from './week';
import { labInstant } from './lab-time';
import { taskTitles } from './task-title';
import type { MeetingRecord, MinutesRecord, TaskRecord, TaskUpdateRecord, UserRecord } from './db/schema';

/**
 * What was written down about one week, for /api/widget/week-notes: the
 * minutes of the week's meetings and the week's progress reports on work.
 * The weekly debrief reads it.
 *
 * Read-only, like the rest of the widget. It goes out with the same key and so
 * to the same person, which is why it carries no more than that person can
 * already read in the app -- see `minutesOf` and `reportsOf` for exactly what
 * that is. People are named, never identified: no emails, no user ids.
 */
export type WeekMinutes = {
  meeting_id: string;
  meeting_title: string;
  /** The meeting's start as stored, ISO. */
  meeting_start_at: string;
  content: string;
  /** Who saved the minutes last, by name; null for an account since removed. */
  recorded_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export type WeekTaskUpdate = {
  task_id: string;
  /** As the weekly page shows it: "Project › Sub-project" for a sub-project. */
  task_title: string;
  week_key: string;
  progress_pct: number;
  summary: string;
  /** null where the app no longer shows it -- see `reportsOf`. */
  risks: string | null;
  /** null where the app no longer shows it -- see `reportsOf`. */
  next_plan: string | null;
  /** Who wrote the report, by name; null for an account since removed. */
  author_name: string | null;
  updated_at: string;
};

export type WeekNotes = {
  week: string;
  minutes: WeekMinutes[];
  task_updates: WeekTaskUpdate[];
};

/**
 * Whether this is an ISO week key that `weekKey()` would produce -- 2026-W43,
 * not 2026-W54, not 2025-W53 (which 2025 does not have), not 2026-w43.
 *
 * Round-trips through the week's Monday, so the rule for which years have a
 * 53rd week lives in one place: week.ts.
 */
export function isWeekKey(value: string): boolean {
  const monday = weekStartDate(value);
  if (!monday) return false;
  // Noon UTC is the same day in the lab, so the round trip cannot slip a day.
  return weekKey(new Date(`${monday}T12:00:00Z`)) === value;
}

/**
 * The `?week=` of a request: the week asked for, null for none (the caller
 * then uses the active week), or `false` for one that is not a week key.
 */
export function readWeekParam(params: URLSearchParams): string | null | false {
  const raw = params.get('week')?.trim();
  if (!raw) return null;
  return isWeekKey(raw) ? raw : false;
}

const byString = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The minutes of the week's meetings, as the meeting page shows them.
 *
 * Anybody signed in may read any meeting's minutes: the meeting page opens
 * every meeting by id and shows its minutes to all, editable or not
 * (meetings/[id]/page.tsx -- "Everybody reads the record of the meeting"), and
 * the history page lists past weeks' for everyone (presentations/history).
 * So the only cut is the week -- meetings starting in it, by the lab's clock,
 * cancelled ones included because their page still opens.
 *
 * One record per meeting, and the same one the page shows: the first row for
 * that meeting (`find`). A second row could only come from a hand-edit, and
 * the app never displays it. A record with nothing written in it reads as
 * "no minutes yet" there, so it is left out here.
 */
function minutesOf(
  sources: { meetings: MeetingRecord[]; minutes: MinutesRecord[] },
  week: string,
  nameOf: (id: string) => string | null,
): WeekMinutes[] {
  return sources.meetings
    .filter((meeting) => {
      const start = labInstant(meeting.start_at);
      return start !== null && weekKey(start) === week;
    })
    .sort((a, b) => byString(a.start_at, b.start_at))
    .flatMap((meeting) => {
      const record = sources.minutes.find((m) => m.meeting_id === meeting.id);
      const content = String(record?.content ?? '');
      if (!record || !content.trim()) return [];
      return [
        {
          meeting_id: meeting.id,
          meeting_title: meeting.title ?? '',
          meeting_start_at: meeting.start_at,
          content,
          recorded_by_name: nameOf(record.recorded_by),
          created_at: record.created_at,
          updated_at: record.updated_at || record.created_at,
        },
      ];
    });
}

/**
 * The week's progress reports, field by field as the app shows them.
 *
 * Two pages show a report, to anybody signed in, for anybody's work:
 *
 * - The tracker (tasks/page.tsx, tracker-model.ts `log`) shows every task's
 *   three newest reports -- the week, the figure and the summary. Not the
 *   risks or the plan.
 * - The weekly page (tasks/weekly/page.tsx) shows all of a report -- summary,
 *   risks, next plan, figure -- but only this calendar week's, and only for
 *   work that is not done. "Only mine" there is a filter the reader can turn
 *   off, not a limit.
 *
 * So a report of the week comes back when either page shows it, carrying the
 * fields that page shows: risks and next_plan are null unless the week is
 * this calendar week and the work is still open. A report on a task that no
 * longer exists is shown nowhere and is left out.
 */
function reportsOf(
  sources: { tasks: TaskRecord[]; updates: TaskUpdateRecord[] },
  week: string,
  nameOf: (id: string) => string | null,
  now: Date,
): WeekTaskUpdate[] {
  const thisWeek = weekKey(now);
  const tasks = new Map(sources.tasks.map((task) => [task.id, task] as const));
  const titleOf = taskTitles(sources.tasks);

  // The tracker's three, per task: newest week first, as tracker-model sorts.
  const onTracker = new Set<TaskUpdateRecord>();
  const byTask = new Map<string, TaskUpdateRecord[]>();
  for (const update of sources.updates) {
    byTask.set(update.task_id, [...(byTask.get(update.task_id) ?? []), update]);
  }
  for (const reports of byTask.values()) {
    reports.sort((a, b) => (a.week_key < b.week_key ? 1 : -1));
    for (const report of reports.slice(0, 3)) onTracker.add(report);
  }

  return sources.updates
    .filter((update) => update.week_key === week)
    .flatMap((update) => {
      const task = tasks.get(update.task_id);
      if (!task) return [];
      const onWeekly = week === thisWeek && task.status !== 'done';
      if (!onWeekly && !onTracker.has(update)) return [];
      return [
        {
          task_id: task.id,
          task_title: titleOf(task),
          week_key: update.week_key,
          progress_pct: Math.round(Number(update.progress_pct) || 0),
          summary: String(update.summary ?? ''),
          risks: onWeekly ? String(update.risks ?? '') : null,
          next_plan: onWeekly ? String(update.next_plan ?? '') : null,
          author_name: nameOf(update.updated_by || update.created_by),
          updated_at: update.updated_at || update.created_at,
        },
      ];
    })
    .sort((a, b) => byString(a.task_title, b.task_title) || byString(a.task_id, b.task_id));
}

export function buildWeekNotes(
  sources: {
    users: UserRecord[];
    meetings: MeetingRecord[];
    minutes: MinutesRecord[];
    tasks: TaskRecord[];
    updates: TaskUpdateRecord[];
  },
  week: string,
  now: Date = new Date(),
): WeekNotes {
  const names = new Map(sources.users.map((user) => [user.id, user.name] as const));
  const nameOf = (id: string) => (id && names.get(id)) || null;

  return {
    week,
    minutes: minutesOf(sources, week, nameOf),
    task_updates: reportsOf(sources, week, nameOf, now),
  };
}
