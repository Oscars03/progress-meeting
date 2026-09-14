'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole, requireSession } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import type { FeedbackRecord } from '@/lib/db/schema';
import {
  FEEDBACK_MAX_LENGTH,
  isFeedbackCategory,
  isFeedbackStatus,
} from './categories';

/**
 * Say something about the app.
 *
 * Open to everyone who can sign in, and only ever about yourself: the author is
 * `created_by`, taken from the session, so there is no field for a caller to
 * put somebody else's name in.
 */
export async function submitFeedbackAction(input: {
  body: string;
  category: string;
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const body = input.body?.trim() ?? '';
    if (!body) throw new UserError('feedback.error.empty');
    if (body.length > FEEDBACK_MAX_LENGTH) {
      throw new UserError('feedback.error.tooLong', { max: FEEDBACK_MAX_LENGTH });
    }

    const category = input.category?.trim() || 'other';
    if (!isFeedbackCategory(category)) {
      throw new UserError('error.invalidValue', { value: category });
    }

    await SheetRepo.insert('feedback', { body, category, status: 'open' }, actor.id);

    revalidatePath('/feedback');
    revalidatePath('/dashboard');
  });
}

/**
 * Mark one as dealt with, or put it back.
 *
 * Admin only. Whether something has been acted on is a statement about what the
 * people running the lab have done, not something its author can assert.
 */
export async function setFeedbackStatusAction(
  id: string,
  status: string,
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('admin');

    if (!isFeedbackStatus(status)) {
      throw new UserError('error.invalidValue', { value: status });
    }

    await SheetRepo.update<FeedbackRecord>('feedback', id, { status }, rowVersion, actor.id);

    revalidatePath('/feedback');
    revalidatePath('/dashboard');
  });
}

/**
 * Withdraw something you wrote.
 *
 * The author can take their own words back; an admin can remove anything, which
 * is the only way to clear something posted in error or in anger. Nobody else
 * can touch it.
 */
export async function deleteFeedbackAction(id: string, rowVersion: number): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const row = await SheetRepo.findOne<FeedbackRecord>('feedback', id);
    if (!row) throw new UserError('error.notFound');

    if (actor.role !== 'admin' && row.created_by !== actor.id) {
      throw new UserError('error.forbidden');
    }

    await SheetRepo.delete('feedback', id, rowVersion, actor.id);

    revalidatePath('/feedback');
    revalidatePath('/dashboard');
  });
}
