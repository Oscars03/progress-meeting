/**
 * Scoring for an availability poll.
 *
 * "Best slot" is the one fewest people are blocked by, then the one most
 * people confirmed. Blockers break ties before popularity does: a meeting
 * nobody has to miss beats a marginally more popular one somebody cannot
 * attend.
 */

/**
 * Two answers: free, or not.
 *
 * This carried a third, "maybe", on the argument that a research group rarely
 * has a window everybody is free for and a soft yes is worth seeing. In use it
 * did the opposite -- it is the comfortable answer, so it absorbed the people
 * who had not really checked, and a slot could look workable on a column of
 * shrugs. Asked to choose, people check.
 *
 * This lives here rather than beside the server actions: a file-level
 * 'use server' turns every export into a server reference, so a plain array
 * exported from there fails at runtime with "can only export async functions".
 */
export const CHOICES = ['yes', 'no'] as const;

export type Choice = (typeof CHOICES)[number];

export function isChoice(value: unknown): value is Choice {
  return typeof value === 'string' && (CHOICES as readonly string[]).includes(value);
}

export const CHOICE_WEIGHT: Record<Choice, number> = {
  yes: 1,
  no: 0,
};

export type SlotTally = {
  slotId: string;
  yes: number;
  no: number;
  /** People invited who have not answered this slot. */
  pending: number;
  score: number;
  /**
   * True only when every voter has answered and none of them said "no".
   *
   * It used to mean "nobody said no yet", which let the badge claim a slot was
   * clear while nine of ten people had not answered at all -- the loudest
   * possible way to be wrong about a time.
   */
  everyoneCanMake: boolean;
};

export function tallySlot(
  slotId: string,
  choicesByUser: Map<string, Choice>,
  voterCount: number
): SlotTally {
  let yes = 0;
  let no = 0;

  // Anything that is not a plain yes counts as a blocker, so a "maybe" left in
  // the sheet from before this was a two-answer poll is read the cautious way
  // rather than quietly scoring as availability nobody confirmed.
  for (const choice of choicesByUser.values()) {
    if (choice === 'yes') yes++;
    else no++;
  }

  const answered = yes + no;
  const pending = Math.max(0, voterCount - answered);

  return {
    slotId,
    yes,
    no,
    pending,
    score: yes * CHOICE_WEIGHT.yes,
    everyoneCanMake: no === 0 && answered > 0 && pending === 0,
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
  const answered = tallies.filter((t) => t.yes + t.no > 0);
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
