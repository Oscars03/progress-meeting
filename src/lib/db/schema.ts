export const COMMON_COLUMNS = ['id', 'created_at', 'updated_at', 'row_version', 'created_by'] as const;

export const SCHEMAS = {
  users: [...COMMON_COLUMNS, 'name', 'email', 'password_hash', 'role', 'team_id', 'line_id', 'active', 'rotation_order'],
  teams: [...COMMON_COLUMNS, 'name'],
  meetings: [...COMMON_COLUMNS, 'title', 'start_at', 'end_at', 'location', 'meet_link', 'status', 'recurrence_rule', 'owner_id', 'notes', 'google_event_id', 'google_calendar_owner_id', 'google_synced_at', 'host_id'],
  meeting_attendees: [...COMMON_COLUMNS, 'meeting_id', 'user_id', 'attend_status', 'present_order'],
  tasks: [...COMMON_COLUMNS, 'title', 'details', 'owner_id', 'assignee_ids', 'due_date', 'priority', 'progress_pct', 'status', 'overdue_flag', 'category', 'project', 'meeting_id', 'links', 'assigner_id'],
  task_updates: [...COMMON_COLUMNS, 'task_id', 'week_key', 'progress_pct', 'summary', 'risks', 'next_plan', 'updated_by'],
  action_items: [...COMMON_COLUMNS, 'meeting_id', 'title', 'owner_id', 'due_date', 'status', 'source_task_id'],
  minutes: [...COMMON_COLUMNS, 'meeting_id', 'content', 'recorded_by'],
  attachments: [...COMMON_COLUMNS, 'entity_type', 'entity_id', 'name', 'url', 'mime', 'size'],
  comments: [...COMMON_COLUMNS, 'entity_type', 'entity_id', 'body', 'author_id', 'mention_ids'],
  notifications: [...COMMON_COLUMNS, 'user_id', 'type', 'payload', 'read_at'],
  reminder_settings: [...COMMON_COLUMNS, 'user_id', 'channel', 'lead_hours'],
  google_tokens: [...COMMON_COLUMNS, 'user_id', 'refresh_token', 'scope', 'account_email', 'connected_at', 'last_error'],
  availability_polls: [...COMMON_COLUMNS, 'title', 'owner_id', 'status', 'meeting_id', 'note'],
  availability_slots: [...COMMON_COLUMNS, 'poll_id', 'start_at', 'end_at'],
  availability_votes: [...COMMON_COLUMNS, 'slot_id', 'user_id', 'choice'],
  audit_log: [...COMMON_COLUMNS, 'actor_id', 'entity', 'entity_id', 'action', 'old', 'new', 'at'],
  // `meta` carries the common columns like every other tab: the repository
  // locates rows by column A being `id`, so a tab without them cannot be
  // read or written correctly.
  meta: [...COMMON_COLUMNS, 'key', 'value'],
  personal_events: [...COMMON_COLUMNS, 'user_id', 'title', 'start_at', 'end_at', 'color', 'category'],
  topics: [...COMMON_COLUMNS, 'title', 'details', 'owner_id', 'week_key', 'meeting_id', 'present_order', 'status'],
  week_leads: [...COMMON_COLUMNS, 'week_key', 'user_id'],
  term_breaks: [...COMMON_COLUMNS, 'name', 'start_date', 'end_date'],
  feedback: [...COMMON_COLUMNS, 'body', 'category', 'status'],
} as const;

export type TableName = keyof typeof SCHEMAS;

/** Every value a sheet cell can round-trip through `find`. */
export type CellValue = string | number | boolean | null | undefined | unknown[] | Record<string, unknown>;

export type BaseRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  row_version: number;
  created_by: string;
};

export type UserRecord = BaseRecord & {
  name: string;
  email: string;
  password_hash: string;
  role: string;
  team_id: string;
  line_id: string;
  active: boolean;
  /**
   * Position in the weekly rotation, 1-based, as arranged by an admin in
   * Settings. Empty for anyone never placed -- they queue after those who were,
   * in the order they joined, so a new student is not silently skipped.
   */
  rotation_order: number | string;
};

export type TaskRecord = BaseRecord & {
  title: string;
  details: string;
  owner_id: string;
  assignee_ids: string[] | string;
  due_date: string;
  priority: string;
  progress_pct: number | string;
  status: string;
  overdue_flag: boolean;
  category: string;
  project: string;
  meeting_id: string;
  links: string[] | string;
  /** The professor who asked for this, when a student entered it themselves. */
  assigner_id: string;
};

export type MeetingRecord = BaseRecord & {
  title: string;
  start_at: string;
  end_at: string;
  location: string;
  meet_link: string;
  status: string;
  recurrence_rule: string;
  owner_id: string;
  notes: string;
  /** Event id in Google Calendar; empty when this meeting was never synced. */
  google_event_id: string;
  /** Whose calendar holds the event -- the account that created it. */
  google_calendar_owner_id: string;
  google_synced_at: string;
  /**
   * Superseded by the `week_leads` tab and no longer read or written.
   *
   * The duty turned out to belong to the week rather than to a meeting -- it is
   * settled before anything is scheduled, and a week with no meeting still uses
   * up a turn. The column stays because the migration only ever appends; do not
   * write to it.
   */
  host_id: string;
};

/**
 * One stored Google authorisation per user.
 *
 * refresh_token is written through secret-box and is never readable from the
 * sheet directly. last_error records why a connection stopped working, so the
 * person can be told to reconnect instead of the feature failing silently.
 */
export type GoogleTokenRecord = BaseRecord & {
  user_id: string;
  refresh_token: string;
  scope: string;
  account_email: string;
  connected_at: string;
  last_error: string;
};

export type MeetingAttendeeRecord = BaseRecord & {
  meeting_id: string;
  user_id: string;
  attend_status: string;
  /** Position in the agenda, 1-based. Empty until an order is set. */
  present_order: number | string;
};

export type MinutesRecord = BaseRecord & {
  meeting_id: string;
  content: string;
  recorded_by: string;
};

export type ActionItemRecord = BaseRecord & {
  meeting_id: string;
  title: string;
  owner_id: string;
  due_date: string;
  status: string;
  /** Links back to the task this item follows up on, when it has one. */
  source_task_id: string;
};

export type TaskUpdateRecord = BaseRecord & {
  task_id: string;
  /** ISO week, e.g. 2026-W38 -- one update per task per week. */
  week_key: string;
  progress_pct: number | string;
  summary: string;
  risks: string;
  next_plan: string;
  updated_by: string;
};

export type AvailabilityPollRecord = BaseRecord & {
  title: string;
  owner_id: string;
  /** open | closed */
  status: string;
  /** Set once the poll is turned into a real meeting. */
  meeting_id: string;
  note: string;
};

export type AvailabilitySlotRecord = BaseRecord & {
  poll_id: string;
  start_at: string;
  end_at: string;
};

export type AvailabilityVoteRecord = BaseRecord & {
  slot_id: string;
  user_id: string;
  /** yes | no */
  choice: string;
};

export type PersonalEventRecord = BaseRecord & {
  user_id: string;
  title: string;
  start_at: string;
  end_at: string;
  /** A key from lib/event-colors.ts, or '' for the category's own colour. */
  color: string;
  /** A key from lib/event-colors.ts, or '' for none stated. */
  category: string;
};

/** Every table has the common columns, so this is the floor for any row. */
export type AnyRecord = BaseRecord & Record<string, CellValue>;

/** Guard used by the repository before it assumes column A holds the id. */
export function assertHasCommonColumns(tabName: TableName): void {
  const headers = SCHEMAS[tabName] as readonly string[];
  for (const [i, col] of COMMON_COLUMNS.entries()) {
    if (headers[i] !== col) {
      throw new Error(
        `Schema for "${tabName}" must begin with ${COMMON_COLUMNS.join(', ')} ` +
          `(column ${i} is "${headers[i]}"). The repository locates rows by column A holding the id.`
      );
    }
  }
}

/**
 * Something a person intends to present in a given week.
 *
 * Anyone may add their own; the week's running order is built from these. The
 * topic belongs to a week rather than to a meeting, so it can be written down
 * before anything has been scheduled -- meeting_id is filled in once there is
 * a meeting to attach it to.
 */
export type TopicRecord = BaseRecord & {
  title: string;
  details: string;
  owner_id: string;
  /** ISO week, e.g. 2026-W38 -- see lib/week.ts. */
  week_key: string;
  meeting_id: string;
  /** Position in the running order, 1-based. Empty while the order is only suggested. */
  present_order: number | string;
  status: string;
};

/**
 * Who is responsible for a given week -- preparing the meeting and writing the
 * summary.
 *
 * The duty belongs to the week, not to a meeting: it is decided before anything
 * is scheduled, and a week with no meeting still has someone whose turn it was.
 * That is why it does not live on `meetings`.
 */
export type WeekLeadRecord = BaseRecord & {
  /** ISO week, e.g. 2026-W38 -- see lib/week.ts. One row per week. */
  week_key: string;
  user_id: string;
};

export type TermBreakRecord = BaseRecord & {
  name: string;
  start_date: string;
  end_date: string;
};

/**
 * Something a member wanted to say about the app itself.
 *
 * `created_by` is the author -- there is no separate column for it, and no way
 * to submit as somebody else. Kept deliberately small: a body, a word for what
 * kind of thing it is, and whether it has been dealt with.
 */
export type FeedbackRecord = BaseRecord & {
  body: string;
  /** 'problem' | 'idea' | 'other' -- see feedback/categories.ts. */
  category: string;
  /** 'open' while it still wants an answer, 'done' once it has had one. */
  status: string;
};

/**
 * A file hanging off something else -- at present, a picture on a piece of
 * feedback. The bytes live on the lab's Google Drive; this row is the record
 * that they exist and what they belong to.
 *
 * `url` holds the Drive file id rather than a link, because there is no link
 * to hold: the file is private to the lab account and is served back through
 * the app to somebody already signed in. The column keeps its name from the
 * original schema.
 */
export type AttachmentRecord = BaseRecord & {
  /** What kind of thing it is attached to, e.g. 'feedback'. */
  entity_type: string;
  entity_id: string;
  /** The original file name, for the download and the alt text. */
  name: string;
  /** The Google Drive file id. */
  url: string;
  mime: string;
  size: number;
};
