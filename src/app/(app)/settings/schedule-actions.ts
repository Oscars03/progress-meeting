'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { PersonalEventRecord } from '@/lib/db/schema';
import { labInstant } from '@/lib/lab-time';
import { isEventCategory, isEventColor } from '@/lib/event-colors';

/**
 * Read the two ends of a block of hours.
 *
 * The form is a datetime-local, so these arrive with no zone. They are read as
 * Thailand and stored as instants: a bare wall clock in the sheet is read as
 * UTC by the server and as Bangkok by the browser, which is how the calendar
 * and the availability grid came to disagree by seven hours about one row.
 */
function readSpan(start_at: string, end_at: string): { start: string; end: string } {
  if (!start_at) throw new Error('settings.error.startRequired');
  if (!end_at) throw new Error('settings.error.endRequired');

  const start = labInstant(start_at);
  const end = labInstant(end_at);
  if (!start || !end || end <= start) throw new Error('settings.error.invalidDate');

  return { start: start.toISOString(), end: end.toISOString() };
}

/** An unrecognised colour or kind is stored as none rather than refused. */
function readLook(color?: string, category?: string): { color: string; category: string } {
  return {
    color: color && isEventColor(color) ? color : '',
    category: category && isEventCategory(category) ? category : '',
  };
}

export async function createPersonalEventAction(data: {
  title: string;
  start_at: string;
  end_at: string;
  color?: string;
  category?: string;
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    if (!data.title.trim()) throw new Error('settings.error.titleRequired');
    const { start, end } = readSpan(data.start_at, data.end_at);
    const look = readLook(data.color, data.category);

    const doc: Omit<PersonalEventRecord, 'id' | 'created_at' | 'updated_at' | 'row_version'> = {
      created_by: actor.id,
      user_id: actor.id,
      title: data.title.trim(),
      start_at: start,
      end_at: end,
      ...look,
    };

    await SheetRepo.insert('personal_events', doc);
    revalidatePath('/settings');
    revalidatePath('/meetings');
    revalidatePath('/meetings/polls');
  });
}

/**
 * Change hours you already blocked out.
 *
 * There was no way to: the calendar could add one and delete one, so a block
 * that started an hour late had to be destroyed and retyped, and its times are
 * exactly the thing most likely to need a nudge.
 *
 * Only the owner. Somebody else's hours are not yours to move, and an admin has
 * no business rewriting when a colleague said they were busy.
 */
export async function updatePersonalEventAction(
  id: string,
  data: {
    title: string;
    start_at: string;
    end_at: string;
    color?: string;
    category?: string;
  },
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const event = await SheetRepo.findOne<PersonalEventRecord>('personal_events', id);
    if (!event) throw new Error('error.notFound');
    if (event.user_id !== actor.id) throw new Error('error.forbidden');

    if (!data.title.trim()) throw new Error('settings.error.titleRequired');
    const { start, end } = readSpan(data.start_at, data.end_at);
    const look = readLook(data.color, data.category);

    await SheetRepo.update<PersonalEventRecord>(
      'personal_events',
      id,
      { title: data.title.trim(), start_at: start, end_at: end, ...look },
      rowVersion,
      actor.id
    );

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
