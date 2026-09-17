'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole, requireSession, hasManagerRights, type SessionUser } from '@/lib/auth-guard';
import { isWeekLead } from '@/lib/rotation';
import type { WeekLeadRecord } from '@/lib/db/schema';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import { weekKey } from '@/lib/week';
import type { TopicRecord } from '@/lib/db/schema';

const MAX_TITLE = 200;

function cleanWeek(value: string | undefined): string {
  const key = value?.trim() || weekKey();
  if (!/^\d{4}-W\d{2}$/.test(key)) throw new UserError('error.invalidValue', { value: key });
  return key;
}

/** Anyone signed in may add a topic, but only ever under their own name. */
export async function addTopic(data: {
  title: string;
  details?: string;
  week_key?: string;
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('student');

    const title = data.title?.trim();
    if (!title) throw new UserError('topics.titleRequired');
    if (title.length > MAX_TITLE) throw new UserError('topics.titleTooLong', { n: MAX_TITLE });

    await SheetRepo.insert(
      'topics',
      {
        title,
        details: data.details?.trim() ?? '',
        owner_id: actor.id,
        week_key: cleanWeek(data.week_key),
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
 * Edit a topic. Yours to change; a professor may also fix anyone's, since they
 * run the meeting and a wrong title should not need the author to be around.
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
    if (topic.owner_id !== actor.id && !hasManagerRights(actor.role)) {
      throw new UserError('topics.notYours');
    }

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
    if (topic.owner_id !== actor.id && !hasManagerRights(actor.role)) {
      throw new UserError('topics.notYours');
    }

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
 * Advisors and admin keep it too.
 *
 * Judged on the week being arranged, not on today: rearranging last week's
 * agenda answers to whoever led last week.
 */
async function assertMayArrange(weekKey: string): Promise<SessionUser> {
  const actor = await requireSession();
  if (hasManagerRights(actor.role)) return actor;

  const leads = await SheetRepo.find<WeekLeadRecord>('week_leads');
  if (!isWeekLead(leads, weekKey, actor.id)) throw new UserError('avail.leadOnly');
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
