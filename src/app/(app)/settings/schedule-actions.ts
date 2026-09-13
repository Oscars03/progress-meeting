'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { PersonalEventRecord } from '@/lib/db/schema';

export async function createPersonalEventAction(data: {
  title: string;
  start_at: string;
  end_at: string;
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    if (!data.title.trim()) throw new Error('settings.error.titleRequired');
    if (!data.start_at) throw new Error('settings.error.startRequired');
    if (!data.end_at) throw new Error('settings.error.endRequired');

    const s = Date.parse(data.start_at);
    const e = Date.parse(data.end_at);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) {
      throw new Error('settings.error.invalidDate');
    }

    const doc: Omit<PersonalEventRecord, 'id' | 'created_at' | 'updated_at' | 'row_version'> = {
      created_by: actor.id,
      user_id: actor.id,
      title: data.title.trim(),
      start_at: data.start_at,
      end_at: data.end_at,
    };

    await SheetRepo.insert('personal_events', doc);
    revalidatePath('/settings');
    revalidatePath('/meetings');
    revalidatePath('/meetings/polls');
  });
}

export async function deletePersonalEventAction(id: string, rowVersion: number): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    
    // We must fetch it to ensure the user owns it.
    const events = await SheetRepo.find<PersonalEventRecord>('personal_events');
    const event = events.find(e => e.id === id);
    
    if (!event) return; // Already deleted or doesn't exist
    
    // Only the owner can delete their own personal event
    if (event.user_id !== actor.id) {
      throw new Error('error.forbidden');
    }

    await SheetRepo.delete('personal_events', id, rowVersion);
    revalidatePath('/settings');
    revalidatePath('/meetings');
    revalidatePath('/meetings/polls');
  });
}
