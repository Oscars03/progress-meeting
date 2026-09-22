import { type SessionUser } from './auth-guard';
import { can } from './permissions';
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
  return can(actor, 'assignWork');
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
  if (can(actor, 'editAnyWork')) return true;
  const assignees = Array.isArray(task.assignee_ids) ? task.assignee_ids : (task.assignee_ids ? [task.assignee_ids as string] : []);
  return assignees.includes(actor.id);
}

/**
 * Who may change what a piece of work *is* -- its name, round, dates and label.
 *
 * The advisors, and whoever wrote it down. A student who added their own work
 * can correct it; one who was handed work cannot rename the assignment. Who
 * it is *for* stays with canAssignWork: a student's own work is theirs alone.
 */
export function canEditDetails(actor: SessionUser, task: Pick<TaskRecord, 'owner_id'>): boolean {
  if (canAssignWork(actor)) return true;
  return Boolean(task.owner_id) && task.owner_id === actor.id;
}

/**
 * Submission rounds belong to whoever hands out work: a round is a deadline
 * the advisors set, not one a student declares for themselves.
 */
export function canManageRounds(actor: SessionUser): boolean {
  return canAssignWork(actor);
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
  if (can(actor, 'removeAnyWork')) return true;
  if (task.owner_id === actor.id) return true;
  return actsAsWeekLead(actor, leads, thisWeek);
}

/**
 * Whether this caller may delete work that is not theirs.
 *
 * The button the board draws has to ask exactly what the action asks, or it
 * offers a delete that comes back refused. Not the same question as editing:
 * these two have already been answered differently once.
 */
export function canRemoveAnyWork(actor: SessionUser): boolean {
  return can(actor, 'removeAnyWork');
}
