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
 * that is, and the one place it goes further. People are named, never identified: no emails, no user ids.
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
  risks: string;
  next_plan: string;
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
 * The week's progress reports, every field of each.
 *
 * Every report is shown to anybody signed in, for anybody's work: the tracker
 * (tasks/page.tsx, tracker-model.ts `log`) lists a task's newest three --
 * week, figure, summary -- and the weekly page (tasks/weekly/page.tsx) shows
 * this calendar week's in full, risks and next plan too, for work not done.
 *
 * This goes a step past those two pages, by the owner's decision (2026-10-23):
 * the week asked for comes back whole -- risks and next plan included -- even
 * once the week is over, the work is done, or the report has fallen out of
 * the tracker's three. The debrief often runs the week after, when the weekly
 * page has already moved on. Nothing the app would not show to some reader on
 * some day goes out: no emails, no ids, and no report on work since deleted,
 * which no page shows at all.
 */
function reportsOf(
  sources: { tasks: TaskRecord[]; updates: TaskUpdateRecord[] },
  week: string,
  nameOf: (id: string) => string | null,
): WeekTaskUpdate[] {
  const tasks = new Map(sources.tasks.map((task) => [task.id, task] as const));
  const titleOf = taskTitles(sources.tasks);

  return sources.updates
    .filter((update) => update.week_key === week)
    .flatMap((update) => {
      const task = tasks.get(update.task_id);
      if (!task) return [];
      return [
        {
          task_id: task.id,
          task_title: titleOf(task),
          week_key: update.week_key,
          progress_pct: Math.round(Number(update.progress_pct) || 0),
          summary: String(update.summary ?? ''),
          risks: String(update.risks ?? ''),
          next_plan: String(update.next_plan ?? ''),
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
): WeekNotes {
  const names = new Map(sources.users.map((user) => [user.id, user.name] as const));
  const nameOf = (id: string) => (id && names.get(id)) || null;

  return {
    week,
    minutes: minutesOf(sources, week, nameOf),
    task_updates: reportsOf(sources, week, nameOf),
  };
}
