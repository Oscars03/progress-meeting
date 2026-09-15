import { hasManagerRights, type SessionUser } from './auth-guard';
import type { TaskRecord, WeekLeadRecord } from './db/schema';
import { isWeekLead } from './rotation';

/**
 * Who may give work to somebody else.
 *
 * Adding work *for yourself* is open to everybody -- see canAddOwnWork. This
 * is the narrower question of putting a task on another person's list, which
 * stays with the advisors.
 */
export function canAssignWork(actor: SessionUser): boolean {
  return hasManagerRights(actor.role);
}

/**
 * Anybody may write down what they have been asked to do.
 *
 * It was professor-and-above, and there is no professor account, so in
 * practice nothing could be added at all. A student entering their own work
 * names the professor who asked for it instead, which is the record that
 * matters and does not need an advisor to be sitting at a keyboard.
 */
export function canAddOwnWork(actor: SessionUser): boolean {
  return Boolean(actor.id);
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

/**
 * Who may remove a piece of work outright.
 *
 * Narrower than editing it. An assignee may move their own work across the
 * board and report on it, but work somebody else put on their list is not
 * theirs to make disappear -- that would let a student answer an assignment
 * by deleting it. Whoever wrote it down can withdraw it, and an advisor or
 * admin can remove anything, which is the only way to clear a mistake.
 */
export function canRemoveWork(
  actor: SessionUser,
  task: Pick<TaskRecord, 'owner_id'>
): boolean {
  return hasManagerRights(actor.role) || task.owner_id === actor.id;
}
