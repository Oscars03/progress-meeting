export const COMMON_COLUMNS = ['id', 'created_at', 'updated_at', 'row_version', 'created_by'] as const;

export const SCHEMAS = {
  users: [...COMMON_COLUMNS, 'name', 'email', 'password_hash', 'role', 'team_id', 'line_id', 'active'],
  teams: [...COMMON_COLUMNS, 'name'],
  meetings: [...COMMON_COLUMNS, 'title', 'start_at', 'end_at', 'location', 'meet_link', 'status', 'recurrence_rule', 'owner_id', 'notes'],
  meeting_attendees: [...COMMON_COLUMNS, 'meeting_id', 'user_id', 'attend_status'],
  tasks: [...COMMON_COLUMNS, 'title', 'details', 'owner_id', 'assignee_ids', 'due_date', 'priority', 'progress_pct', 'status', 'overdue_flag', 'category', 'project', 'meeting_id', 'links'],
  task_updates: [...COMMON_COLUMNS, 'task_id', 'week_key', 'progress_pct', 'summary', 'risks', 'next_plan', 'updated_by'],
  action_items: [...COMMON_COLUMNS, 'meeting_id', 'title', 'owner_id', 'due_date', 'status', 'source_task_id'],
  minutes: [...COMMON_COLUMNS, 'meeting_id', 'content', 'recorded_by'],
  attachments: [...COMMON_COLUMNS, 'entity_type', 'entity_id', 'name', 'url', 'mime', 'size'],
  comments: [...COMMON_COLUMNS, 'entity_type', 'entity_id', 'body', 'author_id', 'mention_ids'],
  notifications: [...COMMON_COLUMNS, 'user_id', 'type', 'payload', 'read_at'],
  reminder_settings: [...COMMON_COLUMNS, 'user_id', 'channel', 'lead_hours'],
  audit_log: [...COMMON_COLUMNS, 'actor_id', 'entity', 'entity_id', 'action', 'old', 'new', 'at'],
  meta: ['key', 'value', 'updated_at'],
} as const;

export type TableName = keyof typeof SCHEMAS;

export type BaseRecord = {
  id: string;
  created_at: string;
  updated_at: string;
  row_version: number;
  created_by: string;
  [key: string]: any;
};
