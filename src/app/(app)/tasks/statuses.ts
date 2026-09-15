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
 * Three, which is as few as can still answer "what happens next": nothing yet,
 * somebody is on it, or it is finished. This started at eight and went to five;
 * the two that have now gone were both about *why* work is in flight rather
 * than whether it is -- and that belongs in the weekly report, which has a
 * field for exactly it, not in a column somebody has to keep dragging between.
 */
export const TASK_STATUSES = ['not_started', 'in_progress', 'done'] as const;

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
  // Stuck is still under way, not finished.
  blocked: 'in_progress',
  // Ready to present is work waiting on a meeting, so it is not done yet --
  // reading it as done would mark something complete that nobody has seen.
  ready_to_present: 'in_progress',
};

/** The column a stored status belongs in today. */
export function readStatus(value: string): TaskStatus {
  if ((TASK_STATUSES as readonly string[]).includes(value)) return value as TaskStatus;
  return RETIRED[value] ?? 'not_started';
}
