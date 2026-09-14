import { hasManagerRights, type SessionUser } from './auth-guard';
import type { TaskRecord, WeekLeadRecord } from './db/schema';
import { isWeekLead } from './rotation';

export function canAssignWork(actor: SessionUser): boolean {
  return hasManagerRights(actor.role);
}

export function canEditWork(actor: SessionUser, task: Pick<TaskRecord, 'assignee_ids'>): boolean {
  if (hasManagerRights(actor.role)) return true;
  const assignees = Array.isArray(task.assignee_ids) ? task.assignee_ids : (task.assignee_ids ? [task.assignee_ids as string] : []);
  return assignees.includes(actor.id);
}

/**
 * Whose progress figure this is: the person the work belongs to, whoever leads
 * the week the update is *for*, or a manager.
 *
 * The week is the one being reported on, not today's -- correcting last week's
 * number answers to whoever led last week.
 */
export function canRecordProgress(actor: SessionUser, task: Pick<TaskRecord, 'assignee_ids'>, weekKey: string, leads: WeekLeadRecord[]): boolean {
  if (canEditWork(actor, task)) return true;
  return isWeekLead(leads, weekKey, actor.id);
}
