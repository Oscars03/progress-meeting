'use server';

import { revalidatePath } from 'next/cache';
import { requireSession } from '@/lib/auth-guard';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { busyTimes, NotConnectedError } from '@/lib/google/calendar';
import { pullMeeting, pushMeeting } from '@/lib/google/meeting-sync';
import { disconnect, getStoredToken, getConnectedUserIds } from '@/lib/google/tokens';
import type { UserRecord } from '@/lib/db/schema';

export type ConnectionStatus = {
  connected: boolean;
  accountEmail: string;
  connectedAt: string;
};

export async function myCalendarStatusAction(): Promise<ConnectionStatus> {
  const actor = await requireSession();
  const stored = await getStoredToken(actor.id);
  return {
    connected: Boolean(stored),
    accountEmail: stored?.accountEmail ?? '',
    connectedAt: stored?.connectedAt ?? '',
  };
}

export async function disconnectCalendarAction(): Promise<void> {
  const actor = await requireSession();
  await disconnect(actor.id);
  revalidatePath('/settings');
}

export async function pushMeetingAction(meetingId: string) {
  const actor = await requireSession();
  const result = await pushMeeting(meetingId, actor.id);
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath('/meetings');
  return result;
}

export async function pullMeetingAction(meetingId: string) {
  const actor = await requireSession();
  const result = await pullMeeting(meetingId, actor.id);
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath('/meetings');
  return result;
}

export type SlotBusy = {
  slotId: string;
  /** Names of people whose calendar shows them busy for this slot. */
  busyNames: string[];
  /** How many people had a calendar we could actually read. */
  checked: number;
};

function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const s1 = Date.parse(aStart);
  const e1 = Date.parse(aEnd);
  const s2 = Date.parse(bStart);
  const e2 = Date.parse(bEnd);
  if ([s1, e1, s2, e2].some(Number.isNaN)) return false;
  // Touching at the boundary is not a clash: a meeting ending at 11:00 does not
  // conflict with one starting at 11:00.
  return s1 < e2 && s2 < e1;
}

/**
 * Who is already busy for each proposed slot.
 *
 * Only people who connected their calendar are checked, and only busy/free is
 * read -- never what the clashing event is. Anybody not connected is simply
 * absent from the answer rather than assumed free, and `checked` says how many
 * calendars the answer is based on so the UI can be honest about its coverage.
 */
export async function slotConflictsAction(
  slots: { id: string; startAt: string; endAt: string }[]
): Promise<SlotBusy[]> {
  await requireSession();
  if (slots.length === 0) return [];

  const [users, connected] = await Promise.all([
    SheetRepo.find<UserRecord>('users'),
    getConnectedUserIds(),
  ]);

  const candidates = users.filter((u) => u.active === true && connected.has(u.id));
  const empty = slots.map((s) => ({ slotId: s.id, busyNames: [], checked: 0 }));
  if (candidates.length === 0) return empty;

  const starts = slots.map((s) => Date.parse(s.startAt)).filter((n) => !Number.isNaN(n));
  const ends = slots.map((s) => Date.parse(s.endAt)).filter((n) => !Number.isNaN(n));
  if (starts.length === 0 || ends.length === 0) return empty;

  const timeMin = new Date(Math.min(...starts)).toISOString();
  const timeMax = new Date(Math.max(...ends)).toISOString();

  const byName = new Map<string, { start: string; end: string }[]>();
  let checked = 0;

  // One freebusy call per person rather than per slot: the window covers every
  // slot, so a second call would ask the same question again.
  for (const user of candidates) {
    try {
      const busy = await busyTimes(user.id, timeMin, timeMax);
      byName.set(user.name, busy);
      checked++;
    } catch (err) {
      // One person's revoked grant must not blank out everybody else's answer.
      if (!(err instanceof NotConnectedError)) {
        console.error(`freebusy failed for ${user.id}:`, err);
      }
    }
  }

  return slots.map((slot) => ({
    slotId: slot.id,
    checked,
    busyNames: [...byName.entries()]
      .filter(([, intervals]) =>
        intervals.some((i) => overlaps(slot.startAt, slot.endAt, i.start, i.end))
      )
      .map(([name]) => name),
  }));
}
