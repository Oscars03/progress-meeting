'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import {
  requireRole,
  requireSession,
  canAddTopic,
  canEditAnyTopic,
  type SessionUser,
} from '@/lib/auth-guard';
import { actsAsWeekLead, agendaWeekKey } from '@/lib/rotation';
import type { MeetingRecord, TermBreakRecord, WeekLeadRecord } from '@/lib/db/schema';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import { weekKey } from '@/lib/week';
import type { TopicRecord } from '@/lib/db/schema';
import { can } from '@/lib/permissions';
import { isPastWeek } from '@/lib/meeting-history';

const MAX_TITLE = 200;

/**
 * A week that is over is a record: everybody reads it on the history page,
 * and only admin may still correct it. Before this, a topic could be reworded
 * or dropped months later and the week's agenda would quietly change.
 *
 * "Over" is the same rollover the running order uses, so the week a meeting
 * has just finished in stays open until its grace day has passed, and a term
 * break counts as over -- nobody presents in one.
 */
async function assertWeekOpen(actor: SessionUser, key: string): Promise<void> {
  if (actor.role === 'admin') return;
  const [meetings, breaks] = await Promise.all([
    SheetRepo.find<MeetingRecord>('meetings'),
    SheetRepo.find<TermBreakRecord>('term_breaks'),
  ]);
  if (isPastWeek(key, agendaWeekKey(meetings, breaks))) throw new UserError('topics.pastWeekLocked');
}

function cleanWeek(value: string | undefined): string {
  const key = value?.trim() || weekKey();
  if (!/^\d{4}-W\d{2}$/.test(key)) throw new UserError('error.invalidValue', { value: key });
  return key;
}

/**
 * Anyone who presents may add a topic, but only ever under their own name.
 *
 * An advisor is the exception: they arrange the week rather than appear in it.
 */
export async function addTopic(data: {
  title: string;
  details?: string;
  week_key?: string;
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('student');
    if (!canAddTopic(actor)) throw new UserError('topics.advisorNoTopics');

    const title = data.title?.trim();
    if (!title) throw new UserError('topics.titleRequired');
    if (title.length > MAX_TITLE) throw new UserError('topics.titleTooLong', { n: MAX_TITLE });

    const week = cleanWeek(data.week_key);
    await assertWeekOpen(actor, week);

    await SheetRepo.insert(
      'topics',
      {
        title,
        details: data.details?.trim() ?? '',
        owner_id: actor.id,
        week_key: week,
        meeting_id: '',
        present_order: '',
        status: 'planned',
      },
      actor.id,
    );

    revalidatePath('/presentations');
  });
}

/**
 * Edit a topic. Yours to change, and admin's to fix.
 *
 * An advisor used to be able to reword anyone's, on the grounds that they run
 * the meeting -- but a topic is a claim about somebody's own work, and the one
 * who wrote it is the one who gets to say what it says.
 */
export async function updateTopic(
  topicId: string,
  data: { title: string; details?: string },
  rowVersion: number,
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('student');

    const topic = await SheetRepo.findOne<TopicRecord>('topics', topicId);
    if (!topic) throw new UserError('error.notFound');
    if (topic.owner_id !== actor.id && !canEditAnyTopic(actor)) {
      throw new UserError('topics.notYours');
    }
    await assertWeekOpen(actor, topic.week_key);

    const title = data.title?.trim();
    if (!title) throw new UserError('topics.titleRequired');
    if (title.length > MAX_TITLE) throw new UserError('topics.titleTooLong', { n: MAX_TITLE });

    await SheetRepo.update(
      'topics',
      topicId,
      { title, details: data.details?.trim() ?? '' },
      rowVersion,
      actor.id,
    );

    revalidatePath('/presentations');
  });
}

export async function deleteTopic(topicId: string, rowVersion: number): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('student');

    const topic = await SheetRepo.findOne<TopicRecord>('topics', topicId);
    if (!topic) throw new UserError('error.notFound');
    if (topic.owner_id !== actor.id && !canEditAnyTopic(actor)) {
      throw new UserError('topics.notYours');
    }
    await assertWeekOpen(actor, topic.week_key);

    await SheetRepo.delete('topics', topicId, rowVersion, actor.id);
    revalidatePath('/presentations');
  });
}

/**
 * Whoever may arrange a week's running order.
 *
 * The lead prepares that week's meeting, so the order it runs in is theirs to
 * decide -- it was professor-and-above only, which meant the one person
 * actually running the meeting had to ask somebody else to move a name.
 * Admin can always step in.
 *
 * Not an advisor by default. They read the order like everybody else;
 * arranging it is part of running the week, and they do not run it. An admin
 * can hand it to one person without promoting them -- the `arrangeOrder`
 * ability in lib/permissions.ts.
 *
 * Judged on the week being arranged, not on today: a coming week's agenda
 * answers to whoever will lead it. A week that is over is admin's alone -- see
 * assertWeekOpen.
 */
async function assertMayArrange(weekKey: string): Promise<SessionUser> {
  const actor = await requireSession();
  if (!can(actor, 'arrangeOrder')) {
    const leads = await SheetRepo.find<WeekLeadRecord>('week_leads');
    if (!actsAsWeekLead(actor, leads, weekKey)) throw new UserError('avail.leadOnly');
  }
  await assertWeekOpen(actor, weekKey);
  return actor;
}

/**
 * Store an explicit running order.
 *
 * Positions are written for every topic in the list at once, because a partial
 * write would leave the week half-arranged and half-suggested -- which reads as
 * neither.
 */
export async function setTopicOrder(
  order: { id: string; row_version: number }[],
  weekKey: string,
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await assertMayArrange(weekKey);
    if (order.length === 0) return;

    const items = order.map((entry, index) => ({
      id: entry.id,
      fields: { present_order: index + 1 },
      expectedVersion: entry.row_version,
    }));
    await SheetRepo.updateMany('topics', items, actor.id);

    revalidatePath('/presentations');
  });
}

/** Drop the stored order, handing the week back to the suggestion. */
export async function clearTopicOrder(
  topics: { id: string; row_version: number }[],
  weekKey: string,
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await assertMayArrange(weekKey);

    const items = topics.map((entry) => ({
      id: entry.id,
      fields: { present_order: '' },
      expectedVersion: entry.row_version,
    }));
    await SheetRepo.updateMany('topics', items, actor.id);

    revalidatePath('/presentations');
  });
}
