/**
 * Task statuses, shared by the server actions and the Kanban client component.
 *
 * This lives outside actions.ts on purpose. A file-level 'use server' turns
 * every export into a server reference, so a plain array exported from there
 * reaches a client component as a proxy rather than an array -- TASK_STATUSES
 * .map() then throws "is not a function". Plain constants belong in a plain
 * module.
 */

/** The only statuses a task may hold; mirrors the Kanban columns. */
export const TASK_STATUSES = [
  'draft',
  'assigned',
  'in_progress',
  'blocked',
  'ready_to_present',
  'presented',
  'follow_up',
  'done',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
