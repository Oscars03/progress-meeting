/**
 * Scoring for an availability poll.
 *
 * "Best slot" is not simply the most yeses: a slot two people cannot make at
 * all is worse than one three people can make at a cost. A "no" therefore
 * outweighs a "maybe", and the count of blockers breaks ties before the score
 * does -- a meeting nobody has to miss beats a marginally more popular one
 * somebody cannot attend.
 */

/**
 * Three answers, not two.
 *
 * A research group rarely has a window everyone is free for. Forcing yes/no
 * hides the slot that works for everybody at a cost, which is usually the one
 * that gets picked.
 *
 * This lives here rather than beside the server actions: a file-level
 * 'use server' turns every export into a server reference, so a plain array
 * exported from there fails at runtime with "can only export async functions".
 */
export const CHOICES = ['yes', 'maybe', 'no'] as const;

export type Choice = (typeof CHOICES)[number];

export function isChoice(value: unknown): value is Choice {
  return typeof value === 'string' && (CHOICES as readonly string[]).includes(value);
}

export const CHOICE_WEIGHT: Record<Choice, number> = {
  yes: 2,
  maybe: 1,
  no: 0,
};

export type SlotTally = {
  slotId: string;
  yes: number;
  maybe: number;
  no: number;
  /** People invited who have not answered this slot. */
  pending: number;
  score: number;
  /** True when nobody answered "no". */
  everyoneCanMake: boolean;
};

export function tallySlot(
  slotId: string,
  choicesByUser: Map<string, Choice>,
  voterCount: number
): SlotTally {
  let yes = 0;
  let maybe = 0;
  let no = 0;

  for (const choice of choicesByUser.values()) {
    if (choice === 'yes') yes++;
    else if (choice === 'maybe') maybe++;
    else no++;
  }

  const answered = yes + maybe + no;
  return {
    slotId,
    yes,
    maybe,
    no,
    pending: Math.max(0, voterCount - answered),
    score: yes * CHOICE_WEIGHT.yes + maybe * CHOICE_WEIGHT.maybe,
    everyoneCanMake: no === 0 && answered > 0,
  };
}

/**
 * Rank tallies best-first: fewest blockers, then highest score, then most
 * firm yeses. Ties past that keep their original order, so the ranking of two
 * genuinely equal slots does not shuffle between renders.
 */
export function rankSlots(tallies: SlotTally[]): SlotTally[] {
  return [...tallies].sort((a, b) => {
    if (a.no !== b.no) return a.no - b.no;
    if (a.score !== b.score) return b.score - a.score;
    return b.yes - a.yes;
  });
}

/** The slot to recommend, or null when nobody has answered anything yet. */
export function bestSlot(tallies: SlotTally[]): SlotTally | null {
  const answered = tallies.filter((t) => t.yes + t.maybe + t.no > 0);
  if (answered.length === 0) return null;
  return rankSlots(answered)[0];
}

/**
 * Every open poll, newest first, with how many slots this person has left to
 * answer.
 *
 * Answered polls are kept rather than filtered out: an answer can be changed
 * while the poll is open, and a poll you can no longer find is a poll you can
 * no longer change. The caller decides how loudly to show each group.
 */
export function openPolls<
  P extends { id: string; status: string; title: string; created_at: string },
  S extends { id: string; poll_id: string },
  V extends { slot_id: string; user_id: string },
>(polls: P[], slots: S[], votes: V[], userId: string): { poll: P; remaining: number }[] {
  return polls
    .filter((poll) => poll.status !== 'closed')
    .map((poll) => {
      const mySlots = slots.filter((slot) => slot.poll_id === poll.id);
      const slotIds = new Set(mySlots.map((slot) => slot.id));
      const answered = new Set(
        votes.filter((v) => v.user_id === userId && slotIds.has(v.slot_id)).map((v) => v.slot_id),
      );
      return { poll, remaining: mySlots.length - answered.size };
    })
    .sort((a, b) => b.poll.created_at.localeCompare(a.poll.created_at));
}
