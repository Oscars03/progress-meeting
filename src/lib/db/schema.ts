export const COMMON_COLUMNS = ['id', 'created_at', 'updated_at', 'row_version', 'created_by'] as const;

export const SCHEMAS = {
  users: [...COMMON_COLUMNS, 'name', 'email', 'password_hash', 'role', 'team_id', 'line_id', 'active'],
  teams: [...COMMON_COLUMNS, 'name'],
  meetings: [...COMMON_COLUMNS, 'title', 'start_at', 'end_at', 'location', 'meet_link', 'status', 'recurrence_rule', 'owner_id', 'notes'],
  meeting_attendees: [...COMMON_COLUMNS, 'meeting_id', 'user_id', 'attend_status', 'present_order'],
  tasks: [...COMMON_COLUMNS, 'title', 'details', 'owner_id', 'assignee_ids', 'due_date', 'priority', 'progress_pct', 'status', 'overdue_flag', 'category', 'project', 'meeting_id', 'links'],
  task_updates: [...COMMON_COLUMNS, 'task_id', 'week_key', 'progress_pct', 'summary', 'risks', 'next_plan', 'updated_by'],
  action_items: [...COMMON_COLUMNS, 'meeting_id', 'title', 'owner_id', 'due_date', 'status', 'source_task_id'],
  minutes: [...COMMON_COLUMNS, 'meeting_id', 'content', 'recorded_by'],
  attachments: [...COMMON_COLUMNS, 'entity_type', 'entity_id', 'name', 'url', 'mime', 'size'],
  comments: [...COMMON_COLUMNS, 'entity_type', 'entity_id', 'body', 'author_id', 'mention_ids'],
  notifications: [...COMMON_COLUMNS, 'user_id', 'type', 'payload', 'read_at'],
  reminder_settings: [...COMMON_COLUMNS, 'user_id', 'channel', 'lead_hours'],
  availability_polls: [...COMMON_COLUMNS, 'title', 'owner_id', 'status', 'meeting_id', 'note'],
  availability_slots: [...COMMON_COLUMNS, 'poll_id', 'start_at', 'end_at'],
  availability_votes: [...COMMON_COLUMNS, 'slot_id', 'user_id', 'choice'],
  audit_log: [...COMMON_COLUMNS, 'actor_id', 'entity', 'entity_id', 'action', 'old', 'new', 'at'],
  // `meta` carries the common columns like every other tab: the repository
  // locates rows by column A being `id`, so a tab without them cannot be
  // read or written correctly.
  meta: [...COMMON_COLUMNS, 'key', 'value'],
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
  /** yes | no | maybe */
  choice: string;
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
