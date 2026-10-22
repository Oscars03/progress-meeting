import { weekKey, weekStartDate } from './week';
import { topicsForWeek } from './presentation-order';
import type { CommentRecord, MeetingRecord, TaskRecord, TopicRecord, UserRecord } from './db/schema';

/**
 * One week's comments, for /api/widget/comments: what was said on that week's
 * meetings, its topics and the work those point at.
 *
 * Read-only, like the rest of the widget. It goes out with the same key and so
 * to the same person, which is why it carries no more than that person can
 * already read in the app: the remark, the name of whoever wrote it and when.
 * No emails, no author ids, no mentions.
 */
export type WeekComment = {
  entity_type: string;
  entity_id: string;
  body: string;
  /** The author's name as the app shows it; null for an account since removed. */
  author_name: string | null;
  created_at: string;
};

export type WeekComments = {
  week: string;
  comments: WeekComment[];
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

type Kind = 'meeting' | 'topic' | 'task';

/**
 * Nothing in the app writes comments yet, so the spelling a future writer
 * picks is unknown: the singular is what attachments use (`feedback`), the
 * plural is the tab's name. Both mean the same rows; anything else matches
 * nothing.
 */
const KIND: Record<string, Kind> = {
  meeting: 'meeting',
  meetings: 'meeting',
  topic: 'topic',
  topics: 'topic',
  task: 'task',
  tasks: 'task',
};

/**
 * Which rows of the week a comment may hang off.
 *
 * Who may *read* them is not narrowed further here, and deliberately so: the
 * app shows every meeting, topic and piece of work to every signed-in, active
 * account. The meeting page opens any meeting by id (meetings/[id]/page.tsx),
 * the running order of any week is "everybody may read it"
 * (presentations/page.tsx), and the tracker lists every task
 * (tasks/page.tsx). An inactive account never gets this far -- withWidgetKey
 * refuses its key. What the app *does* hide is a dropped topic, so that is
 * left out here too (topicsForWeek).
 *
 * The week's meetings are those that start in it, cancelled ones included:
 * a cancelled meeting's page still opens. Its work is the work a meeting of
 * the week names in `tasks.meeting_id`, and the work a topic of the week was
 * picked from (`topics.task_id`) -- the link the app actually makes today.
 */
function weekEntities(
  sources: { meetings: MeetingRecord[]; topics: TopicRecord[]; tasks: TaskRecord[] },
  week: string,
): Record<Kind, Set<string>> {
  const meetings = new Set(
    sources.meetings
      .filter((meeting) => {
        if (!meeting.start_at) return false;
        const start = new Date(meeting.start_at);
        return !Number.isNaN(start.getTime()) && weekKey(start) === week;
      })
      .map((meeting) => meeting.id),
  );

  const topics = topicsForWeek(sources.topics, week);
  const fromTopics = new Set(topics.map((topic) => topic.task_id).filter(Boolean));

  const tasks = new Set(
    sources.tasks
      .filter((task) => (task.meeting_id && meetings.has(task.meeting_id)) || fromTopics.has(task.id))
      .map((task) => task.id),
  );

  return { meeting: meetings, topic: new Set(topics.map((topic) => topic.id)), task: tasks };
}

export function buildWeekComments(
  sources: {
    users: UserRecord[];
    meetings: MeetingRecord[];
    topics: TopicRecord[];
    tasks: TaskRecord[];
    comments: CommentRecord[];
  },
  week: string,
): WeekComments {
  const entities = weekEntities(sources, week);
  const nameOf = new Map(sources.users.map((user) => [user.id, user.name] as const));

  const comments = sources.comments
    .filter((comment) => {
      const kind = KIND[String(comment.entity_type ?? '').trim().toLowerCase()];
      return Boolean(kind) && entities[kind].has(String(comment.entity_id ?? ''));
    })
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0))
    .map((comment) => ({
      entity_type: comment.entity_type,
      entity_id: comment.entity_id,
      body: String(comment.body ?? ''),
      author_name: nameOf.get(comment.author_id) || null,
      created_at: comment.created_at,
    }));

  return { week, comments };
}
