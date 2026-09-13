'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole, requireSession } from '@/lib/auth-guard';
import { isChoice, type Choice } from '@/lib/poll-tally';
import { UserError } from '@/lib/user-error';
import { toResult } from '@/lib/action-result';
import type {
  AvailabilityPollRecord,
  AvailabilitySlotRecord,
  AvailabilityVoteRecord,
} from '@/lib/db/schema';

function assertChoice(value: string): asserts value is Choice {
  if (!isChoice(value)) {
    throw new UserError('polls.error.invalidAnswer', { value });
  }
}

function revalidate(pollId?: string) {
  revalidatePath('/meetings/polls');
  if (pollId) revalidatePath(`/meetings/polls/${pollId}`);
  revalidatePath('/meetings');
}

export async function createPollAction(input: {
  title: string;
  note: string;
  slots: { start: string; end: string }[];
}) {
  return toResult(async () => {
  const actor = await requireRole('manager');

  const title = input.title.trim();
  if (!title) throw new UserError('polls.error.titleRequired');

  const slots = input.slots
    .map((s) => ({ start: s.start?.trim() ?? '', end: s.end?.trim() ?? '' }))
    .filter((s) => s.start && s.end);

  if (slots.length === 0) throw new UserError('polls.error.minSlots');

  for (const s of slots) {
    if (Date.parse(s.end) <= Date.parse(s.start)) {
      throw new UserError('polls.error.invalidTime');
    }
  }

  const poll = await SheetRepo.insert(
    'availability_polls',
    {
      title,
      owner_id: actor.id,
      status: 'open',
      meeting_id: '',
      note: input.note?.trim() ?? '',
    },
    actor.id
  );

  for (const s of slots) {
    await SheetRepo.insert(
      'availability_slots',
      { poll_id: poll.id, start_at: s.start, end_at: s.end },
      actor.id
    );
  }

  revalidate(poll.id);
  return { pollId: poll.id };
  });
}

/**
 * Record one person's answer for one slot.
 *
 * One vote per person per slot: answering again replaces the old answer rather
 * than adding a second, so the tally cannot count the same person twice.
 */
export async function voteAction(
  pollId: string,
  slotId: string,
  choice: string
) {
  return toResult(async () => {
  const actor = await requireSession();
  assertChoice(choice);

  const votes = await SheetRepo.find<AvailabilityVoteRecord>('availability_votes');
  const existing = votes.find((v) => v.slot_id === slotId && v.user_id === actor.id);

  if (existing) {
    if (existing.choice === choice) return;
    await SheetRepo.update<AvailabilityVoteRecord>(
      'availability_votes',
      existing.id,
      { choice },
      existing.row_version,
      actor.id
    );
  } else {
    await SheetRepo.insert(
      'availability_votes',
      { slot_id: slotId, user_id: actor.id, choice },
      actor.id
    );
  }

  revalidate(pollId);
  });
}

export async function closePollAction(
  pollId: string,
  rowVersion: number,
  status: 'open' | 'closed'
) {
  return toResult(async () => {
  const actor = await requireRole('manager');
  await SheetRepo.update<AvailabilityPollRecord>(
    'availability_polls',
    pollId,
    { status },
    rowVersion,
    actor.id
  );
  revalidate(pollId);
  });
}

/**
 * Turn the chosen slot into a real meeting and close the poll.
 *
 * The poll keeps meeting_id so the decision stays traceable: which options were
 * offered, who answered what, and which one won.
 */
export async function confirmSlotAction(
  pollId: string,
  rowVersion: number,
  slotId: string
) {
  return toResult(async () => {
  const actor = await requireRole('manager');

  const [polls, slots] = await Promise.all([
    SheetRepo.find<AvailabilityPollRecord>('availability_polls'),
    SheetRepo.find<AvailabilitySlotRecord>('availability_slots'),
  ]);

  const poll = polls.find((p) => p.id === pollId);
  if (!poll) throw new UserError('polls.error.notFound');
  if (poll.meeting_id) throw new UserError('polls.error.alreadyConfirmed');

  const slot = slots.find((s) => s.id === slotId && s.poll_id === pollId);
  if (!slot) throw new UserError('polls.error.slotNotFound');

  const meeting = await SheetRepo.insert(
    'meetings',
    {
      title: poll.title,
      start_at: slot.start_at,
      end_at: slot.end_at,
      location: '',
      meet_link: '',
      status: 'scheduled',
      recurrence_rule: '',
      owner_id: poll.owner_id || actor.id,
      notes: poll.note ?? '',
    },
    actor.id
  );

  await SheetRepo.update<AvailabilityPollRecord>(
    'availability_polls',
    pollId,
    { status: 'closed', meeting_id: meeting.id },
    rowVersion,
    actor.id
  );

  revalidate(pollId);
  return { meetingId: meeting.id };
  });
}

export async function deletePollAction(pollId: string, rowVersion: number) {
  return toResult(async () => {
  const actor = await requireRole('manager');

  const [slots, votes] = await Promise.all([
    SheetRepo.find<AvailabilitySlotRecord>('availability_slots'),
    SheetRepo.find<AvailabilityVoteRecord>('availability_votes'),
  ]);

  const mySlots = slots.filter((s) => s.poll_id === pollId);
  const slotIds = new Set(mySlots.map((s) => s.id));

  // Votes first, then slots, then the poll: deleting top-down would leave rows
  // pointing at a parent that no longer exists if a later step failed.
  for (const vote of votes.filter((v) => slotIds.has(v.slot_id))) {
    await SheetRepo.delete('availability_votes', vote.id, vote.row_version, actor.id);
  }
  for (const slot of mySlots) {
    await SheetRepo.delete('availability_slots', slot.id, slot.row_version, actor.id);
  }
  await SheetRepo.delete('availability_polls', pollId, rowVersion, actor.id);

  revalidate();
  });
}
