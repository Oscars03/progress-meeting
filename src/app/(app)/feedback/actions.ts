'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole, requireSession } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import type { AttachmentRecord, FeedbackRecord } from '@/lib/db/schema';
import { removeFile, storeFile } from '@/lib/google/drive';
import { checkImage, safeFileName } from '@/lib/uploads';
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
export async function submitFeedbackAction(form: FormData): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const body = String(form.get('body') ?? '').trim();
    if (!body) throw new UserError('feedback.error.empty');
    if (body.length > FEEDBACK_MAX_LENGTH) {
      throw new UserError('feedback.error.tooLong', { max: FEEDBACK_MAX_LENGTH });
    }

    const category = String(form.get('category') ?? '').trim() || 'other';
    if (!isFeedbackCategory(category)) {
      throw new UserError('error.invalidValue', { value: category });
    }

    // Checked here and not only in the form: a server action is reachable by
    // anyone holding its id, so the browser's refusal decides nothing.
    const picture = form.get('image');
    const image = picture instanceof File && picture.size > 0 ? picture : null;
    if (image) {
      const problem = checkImage(image);
      if (problem) throw new UserError(problem);
    }

    // The picture goes up first. Storing it after the row would leave feedback
    // claiming an image that failed to arrive; failing here leaves nothing
    // behind but an unsaved form, which is the better of the two.
    let stored: { fileId: string; size: number } | null = null;
    if (image) {
      stored = await storeFile({
        name: safeFileName(image.name),
        mime: image.type,
        bytes: Buffer.from(await image.arrayBuffer()),
      });
    }

    try {
      const row = await SheetRepo.insert('feedback', { body, category, status: 'open' }, actor.id);

      if (stored) {
        await SheetRepo.insert(
          'attachments',
          {
            entity_type: 'feedback',
            entity_id: row.id,
            name: safeFileName(image!.name),
            url: stored.fileId,
            mime: image!.type,
            size: stored.size,
          },
          actor.id
        );
      }
    } catch (err) {
      // The sheet refused after the bytes were already on Drive. Take them
      // back rather than leaving a file nothing will ever point at.
      if (stored) await removeFile(stored.fileId);
      throw err;
    }

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

    // The picture was part of what was said, so withdrawing the words
    // withdraws it too -- otherwise "delete" would leave the most revealing
    // half of a report sitting on the lab's Drive.
    const attachments = await SheetRepo.find<AttachmentRecord>('attachments');
    const mine = attachments.filter((a) => a.entity_type === 'feedback' && a.entity_id === id);

    await SheetRepo.delete('feedback', id, rowVersion, actor.id);

    for (const file of mine) {
      await SheetRepo.delete('attachments', file.id, file.row_version, actor.id);
      await removeFile(file.url);
    }

    revalidatePath('/feedback');
    revalidatePath('/dashboard');
  });
}
