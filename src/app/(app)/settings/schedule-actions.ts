'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { PersonalEventRecord } from '@/lib/db/schema';
import { labInstant } from '@/lib/lab-time';

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

    // The form is a datetime-local, so these arrive with no zone. Read them as
    // Thailand and store the instant, not the wall clock -- a bare wall clock
    // in the sheet is read as UTC by the server and as Bangkok by the browser,
    // which is how the calendar and the availability grid came to disagree by
    // seven hours about the same row.
    const start = labInstant(data.start_at);
    const end = labInstant(data.end_at);
    if (!start || !end || end <= start) {
      throw new Error('settings.error.invalidDate');
    }

    const doc: Omit<PersonalEventRecord, 'id' | 'created_at' | 'updated_at' | 'row_version'> = {
      created_by: actor.id,
      user_id: actor.id,
      title: data.title.trim(),
      start_at: start.toISOString(),
      end_at: end.toISOString(),
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
