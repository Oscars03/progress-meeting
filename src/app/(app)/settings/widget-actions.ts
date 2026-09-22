'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession } from '@/lib/auth-guard';
import type { WidgetKeyRecord } from '@/lib/db/schema';
import { toResult, type ActionResult } from '@/lib/action-result';
import { generateWidgetKey, hashWidgetKey } from '@/lib/widget-key';

/**
 * Remove every widget key this person holds. There should only ever be one,
 * but a stray duplicate must not survive a revoke.
 */
async function deleteMyKeys(userId: string): Promise<void> {
  const mine = (await SheetRepo.find<WidgetKeyRecord>('widget_keys', { fresh: true })).filter(
    (row) => row.user_id === userId,
  );
  for (const row of mine) {
    await SheetRepo.delete('widget_keys', row.id, row.row_version, userId);
  }
}

/**
 * Make a new widget key for yourself, replacing any you had.
 *
 * The key is returned here and nowhere else: only its hash is stored, so this
 * response is the one chance to copy it. Making a new one is also how a key
 * that may have leaked is replaced -- the old one stops working at once.
 */
export async function createWidgetKeyAction(): Promise<ActionResult<{ key: string }>> {
  return toResult(async () => {
    const actor = await requireSession();

    await deleteMyKeys(actor.id);

    const key = generateWidgetKey();
    await SheetRepo.insert(
      'widget_keys',
      { user_id: actor.id, key_hash: hashWidgetKey(key), last_used_at: '' },
      actor.id,
    );

    revalidatePath('/settings', 'layout');
    return { key };
  });
}

/** Switch your widget off. Any phone still using the key gets a 401 on its next refresh. */
export async function revokeWidgetKeyAction(): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    await deleteMyKeys(actor.id);
    revalidatePath('/settings', 'layout');
  });
}
