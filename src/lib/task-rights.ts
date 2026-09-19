import { directsWork, type SessionUser } from './auth-guard';
import type { TaskRecord, WeekLeadRecord } from './db/schema';
import { actsAsWeekLead } from './rotation';

/**
 * Who may give work to somebody else.
 *
 * Adding work *for yourself* is open to everybody -- see canAddOwnWork. This
 * is the narrower question of putting a task on another person's list, which
 * stays with the advisors.
 */
export function canAssignWork(actor: SessionUser): boolean {
  return directsWork(actor.role);
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
  if (directsWork(actor.role)) return true;
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
  return actsAsWeekLead(actor, leads, weekKey);
}

/**
 * Who may remove a piece of work outright.
 *
 * Narrower than editing it. An assignee may move their own work across the
 * board and report on it, but work somebody else put on their list is not
 * theirs to make disappear -- that would let a student answer an assignment
 * by deleting it.
 *
 * Three can: whoever wrote it down, because they can withdraw their own; the
 * lead of the week, because tidying the board is part of preparing the meeting
 * that reads from it; and an advisor or admin, which is the only way to clear
 * somebody else's mistake.
 *
 * The advisor's part here is the whole of the work -- setting it, changing it
 * and taking it back. They are the one who asked for it, so they are the one
 * who can say it is no longer wanted.
 *
 * The lead is judged on the current week rather than any week they have ever
 * held -- the claim is "I am running this week's meeting", not "I ran one once".
 */
export function canRemoveWork(
  actor: SessionUser,
  task: Pick<TaskRecord, 'owner_id'>,
  thisWeek: string,
  leads: WeekLeadRecord[]
): boolean {
  if (directsWork(actor.role)) return true;
  if (task.owner_id === actor.id) return true;
  return actsAsWeekLead(actor, leads, thisWeek);
}
