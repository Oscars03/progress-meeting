/**
 * Task statuses, shared by the server actions and the Kanban client component.
 *
 * This lives outside actions.ts on purpose. A file-level 'use server' turns
 * every export into a server reference, so a plain array exported from there
 * reaches a client component as a proxy rather than an array -- TASK_STATUSES
 * .map() then throws "is not a function". Plain constants belong in a plain
 * module.
 */

/**
 * The only statuses a task may hold; mirrors the Kanban columns.
 *
 * Eight columns did not fit a screen and did not fit the way the lab works
 * either -- `draft` and `assigned` both meant nobody had started, `presented`
 * and `follow_up` both meant the meeting had moved on. Five is what is left
 * once each column has a distinct answer to "what happens next".
 */
export const TASK_STATUSES = [
  'not_started',
  'in_progress',
  'blocked',
  'ready_to_present',
  'done',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

/**
 * What the retired statuses become.
 *
 * Rows written before the list shrank still carry the old value, and a board
 * that silently drops them would lose work rather than move it. Read through
 * this instead of trusting the stored string.
 */
const RETIRED: Record<string, TaskStatus> = {
  draft: 'not_started',
  assigned: 'not_started',
  presented: 'done',
  follow_up: 'in_progress',
};

/** The column a stored status belongs in today. */
export function readStatus(value: string): TaskStatus {
  if ((TASK_STATUSES as readonly string[]).includes(value)) return value as TaskStatus;
  return RETIRED[value] ?? 'not_started';
}
