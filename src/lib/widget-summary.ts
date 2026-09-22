import { activeWeekKey, nextMeeting } from './rotation';
import { effectiveTopicOrder, groupByPresenter, topicsForWeek } from './presentation-order';
import { openPolls } from './poll-tally';
import { memberIds } from './members';
import { formatLabClock, formatLabTime, labDay } from './lab-time';
import type {
  AvailabilityPollRecord,
  AvailabilitySlotRecord,
  AvailabilityVoteRecord,
  MeetingRecord,
  TaskRecord,
  TopicRecord,
  UserRecord,
} from './db/schema';

/**
 * What the phone widget shows one person: the next meeting, its running order,
 * their open tasks and the polls still waiting on them.
 *
 * Built from the same helpers as the dashboard, so the widget can never
 * disagree with the page it summarises. Everything is decided here, on the
 * server -- the widget only draws -- so no more leaves the app than this: no
 * emails, no ids other than the reader's own place in the order, no notes.
 *
 * Times go out both as an instant and already formatted in the lab's zone and
 * in Thai: a Scriptable or KWGT widget has no business doing time-zone maths.
 */
export type WidgetSummary = {
  generatedAt: string;
  meeting: {
    title: string;
    startAt: string;
    /** e.g. "พฤ. 25 ก.ย. 13:30" */
    when: string;
    /** e.g. "13:30–15:00", empty without an end. */
    time: string;
    location: string;
    /** Lab days from today: 0 today, 1 tomorrow. */
    daysAway: number;
  } | null;
  presentations: {
    position: number;
    name: string;
    topics: string[];
    isMe: boolean;
  }[];
  /** Where the reader comes in the order, or null if they are not presenting. */
  myPosition: number | null;
  tasks: {
    title: string;
    dueDate: string;
    /** 'overdue' | 'soon' (within 7 days) | 'later' | 'none' (no due date) */
    due: 'overdue' | 'soon' | 'later' | 'none';
  }[];
  /** Every open task of the reader's by due state -- `tasks` itself is capped. */
  taskCounts: { total: number; overdue: number; soon: number; later: number; none: number };
  polls: {
    title: string;
    /** Slots in the poll this person has not answered yet. */
    remaining: number;
  }[];
  /**
   * Each section already set as lines of text. KWGT on Android reads one value
   * per formula and cannot loop over a list, so without these every row would
   * need a formula of its own.
   */
  text: {
    meeting: string;
    presentations: string;
    tasks: string;
    polls: string;
  };
};

export type WidgetSources = {
  users: UserRecord[];
  meetings: MeetingRecord[];
  topics: TopicRecord[];
  tasks: TaskRecord[];
  polls: AvailabilityPollRecord[];
  slots: AvailabilitySlotRecord[];
  votes: AvailabilityVoteRecord[];
};

/** How far ahead a due date counts as "soon". */
const SOON_DAYS = 7;
/** Enough to fill the largest widget; the rest are one tap away in the app. */
const MAX_TASKS = 5;

function assigneesOf(task: TaskRecord): string[] {
  if (Array.isArray(task.assignee_ids)) return task.assignee_ids;
  return task.assignee_ids ? [task.assignee_ids] : [];
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from one YYYY-MM-DD to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function dueState(dueDate: string, today: string): WidgetSummary['tasks'][number]['due'] {
  const day = dueDate.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return 'none';
  if (day < today) return 'overdue';
  if (day <= addDays(today, SOON_DAYS)) return 'soon';
  return 'later';
}

export function buildWidgetSummary(
  sources: WidgetSources,
  userId: string,
  now: Date = new Date(),
): WidgetSummary {
  const { users, meetings, topics, tasks, polls, slots, votes } = sources;
  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? '';

  const today = labDay(now);
  const upcoming = nextMeeting(meetings, now);
  const meeting = upcoming
    ? {
        title: upcoming.title,
        startAt: upcoming.start_at,
        when: formatLabTime(upcoming.start_at, 'th'),
        time: upcoming.end_at
          ? `${formatLabClock(upcoming.start_at, 'th')}–${formatLabClock(upcoming.end_at, 'th')}`
          : '',
        location: upcoming.location ?? '',
        daysAway: daysBetween(today, labDay(new Date(upcoming.start_at))),
      }
    : null;

  // The same week the dashboard's "your turn" line reads.
  const weekTopics = topicsForWeek(topics, activeWeekKey(meetings, now));
  const presenters = groupByPresenter(effectiveTopicOrder(weekTopics).ordered);
  const presentations = presenters.map((block, index) => ({
    position: index + 1,
    name: nameOf(block.ownerId),
    topics: block.topics.map((topic) => topic.title),
    isMe: block.ownerId === userId,
  }));
  const mine = presentations.find((row) => row.isMe);

  const allMyTasks = tasks
    .filter((task) => task.status !== 'done' && assigneesOf(task).includes(userId))
    .map((task) => ({ title: task.title, dueDate: task.due_date ?? '', due: dueState(task.due_date ?? '', today) }))
    // Dated first, soonest first; undated last, as on the dashboard.
    .sort((a, b) => {
      const aDated = a.due !== 'none';
      const bDated = b.due !== 'none';
      if (aDated !== bDated) return aDated ? -1 : 1;
      return a.dueDate.localeCompare(b.dueDate);
    });
  const myTasks = allMyTasks.slice(0, MAX_TASKS);
  const taskCounts = { total: allMyTasks.length, overdue: 0, soon: 0, later: 0, none: 0 };
  for (const task of allMyTasks) taskCounts[task.due] += 1;

  // Only members are asked to answer polls -- the dashboard chases nobody else.
  const waiting = memberIds(users).has(userId)
    ? openPolls(polls, slots, votes, userId)
        .filter((row) => row.remaining > 0)
        .map((row) => ({ title: row.poll.title, remaining: row.remaining }))
    : [];

  return {
    generatedAt: now.toISOString(),
    meeting,
    presentations,
    myPosition: mine ? mine.position : null,
    tasks: myTasks,
    taskCounts,
    polls: waiting,
    text: {
      meeting: meeting
        ? [meeting.when, meeting.time && `(${meeting.time})`, meeting.location && `· ${meeting.location}`]
            .filter(Boolean)
            .join(' ')
        : 'ยังไม่มีนัดประชุม',
      presentations: presentations.length
        ? presentations
            .map((row) => `${row.isMe ? '▶ ' : ''}${row.position}. ${row.name} — ${row.topics.join(', ')}`)
            .join('\n')
        : 'ยังไม่มีหัวข้อนำเสนอสัปดาห์นี้',
      tasks: myTasks.length
        ? myTasks
            .map((task) => {
              const mark = task.due === 'overdue' ? '⚠ ' : task.due === 'soon' ? '• ' : '';
              return `${mark}${task.title}${task.dueDate ? ` (${task.dueDate.slice(0, 10)})` : ''}`;
            })
            .join('\n')
        : 'ไม่มีงานค้าง',
      polls: waiting.length
        ? waiting.map((poll) => `${poll.title} — ยังไม่ตอบ ${poll.remaining} ช่วง`).join('\n')
        : 'ไม่มีโพลที่รอคุณตอบ',
    },
  };
}
