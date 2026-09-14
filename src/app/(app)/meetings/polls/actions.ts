'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession } from '@/lib/auth-guard';
import { isChoice, type Choice } from '@/lib/poll-tally';
import { isWeekLead } from '@/lib/rotation';
import { weekKey } from '@/lib/week';
import { labInstant } from '@/lib/lab-time';
import { UserError } from '@/lib/user-error';
import { toResult } from '@/lib/action-result';
import type {
  WeekLeadRecord,
  AvailabilityPollRecord,
  AvailabilitySlotRecord,
  AvailabilityVoteRecord,
  TermBreakRecord,
} from '@/lib/db/schema';
import { breakCovering } from '@/lib/term-breaks';

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

/**
 * Open a poll asking everyone to confirm a time.
 *
 * Whoever holds the week is the one preparing that meeting, so arranging its
 * time is their job -- not a rank. An admin can always step in, otherwise a
 * week whose lead is not yet confirmed would have nobody able to act at all.
 *
 * Checked here rather than only in the page: a server action is reachable by
 * anyone holding its id, so a hidden button protects nothing.
 */
/**
 * Running a poll belongs to whoever runs the week it is for -- the same rule
 * that governs opening one. Admin stays the fallback, so a week with no
 * confirmed lead is not a poll nobody can finish.
 *
 * The week comes from the poll's own slots, so a poll is governed by the week
 * it would schedule, not by when it happened to be created.
 */
async function assertRunsThePoll(
  actor: { id: string; role: string },
  pollSlots: { start_at: string }[],
): Promise<void> {
  if (actor.role === 'admin') return;

  const earliest = [...pollSlots].sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
  if (!earliest) throw new UserError('avail.leadOnly');

  const leads = await SheetRepo.find<WeekLeadRecord>('week_leads');
  if (!isWeekLead(leads, weekKey(labInstant(earliest.start_at) ?? new Date(NaN)), actor.id)) {
    throw new UserError('avail.leadOnly');
  }
}

export async function createPollAction(input: {
  title: string;
  note: string;
  slots: { start: string; end: string }[];
}) {
  return toResult(async () => {
  const actor = await requireSession();

  const title = input.title.trim();
  if (!title) throw new UserError('polls.error.titleRequired');

  // The slot pickers are datetime-locals, so what arrives is a bare wall clock.
  // Resolve it against the lab's zone here, once, and carry instants from this
  // point on: the winning slot is copied straight into the meeting it creates.
  // A half-filled row is the form's spare slot, not a mistake, so it is dropped;
  // a row that is filled in but unreadable is a mistake and says so.
  const filled = input.slots.filter((s) => s.start?.trim() && s.end?.trim());
  if (filled.length === 0) throw new UserError('polls.error.minSlots');

  const slots = filled.map((s) => {
    const start = labInstant(s.start);
    const end = labInstant(s.end);
    if (!start || !end || end <= start) throw new UserError('polls.error.invalidTime');
    return { start: start.toISOString(), end: end.toISOString() };
  });

  if (actor.role !== 'admin') {
    const week = weekKey(new Date(slots[0].start));
    const leads = await SheetRepo.find<WeekLeadRecord>('week_leads');
    if (!isWeekLead(leads, week, actor.id)) throw new UserError('avail.leadOnly');
  }

  const breaks = await SheetRepo.find<TermBreakRecord>('term_breaks');
  for (const s of slots) {
    const coveringBreak = breakCovering(breaks, s.start.slice(0, 10));
    if (coveringBreak) throw new UserError('error.duringBreak', { name: coveringBreak.name });
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
  const actor = await requireSession();

  const slots = await SheetRepo.find<AvailabilitySlotRecord>('availability_slots');
  await assertRunsThePoll(actor, slots.filter((s) => s.poll_id === pollId));

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
  const actor = await requireSession();

  const [polls, slots] = await Promise.all([
    SheetRepo.find<AvailabilityPollRecord>('availability_polls'),
    SheetRepo.find<AvailabilitySlotRecord>('availability_slots'),
  ]);

  const poll = polls.find((p) => p.id === pollId);
  if (!poll) throw new UserError('polls.error.notFound');
  if (poll.meeting_id) throw new UserError('polls.error.alreadyConfirmed');

  const slot = slots.find((s) => s.id === slotId && s.poll_id === pollId);
  if (!slot) throw new UserError('polls.error.slotNotFound');

  const breaks = await SheetRepo.find<TermBreakRecord>('term_breaks');
  const coveringBreak = breakCovering(breaks, slot.start_at.slice(0, 10));
  if (coveringBreak) throw new UserError('error.duringBreak', { name: coveringBreak.name });

  await assertRunsThePoll(actor, [slot]);

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
  const actor = await requireSession();

  const [slots, votes] = await Promise.all([
    SheetRepo.find<AvailabilitySlotRecord>('availability_slots'),
    SheetRepo.find<AvailabilityVoteRecord>('availability_votes'),
  ]);

  const mySlots = slots.filter((s) => s.poll_id === pollId);
  await assertRunsThePoll(actor, mySlots);
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
