import { hasManagerRights, type SessionUser } from './auth-guard';
import type { TaskRecord } from './db/schema';

export function canAssignWork(actor: SessionUser): boolean {
  return hasManagerRights(actor.role);
}

export function canEditWork(actor: SessionUser, task: Pick<TaskRecord, 'assignee_ids'>): boolean {
  if (hasManagerRights(actor.role)) return true;
  const assignees = Array.isArray(task.assignee_ids) ? task.assignee_ids : (task.assignee_ids ? [task.assignee_ids as string] : []);
  return assignees.includes(actor.id);
}
