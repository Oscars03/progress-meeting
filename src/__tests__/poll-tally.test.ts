import { describe, it, expect } from 'vitest';
import { tallySlot, rankSlots, bestSlot, openPolls, pollIsOver, type Choice, type SlotTally } from '../lib/poll-tally';

const votes = (entries: [string, Choice][]) => new Map<string, Choice>(entries);

describe('tallySlot', () => {
  it('counts each answer and scores only the yeses', () => {
    const t = tallySlot(
      's1',
      votes([
        ['u1', 'yes'],
        ['u2', 'yes'],
        ['u3', 'no'],
      ]),
      3
    );
    expect(t).toMatchObject({ yes: 2, no: 1, pending: 0, score: 2 });
  });

  // The poll used to offer a third answer. A row left in the sheet from then
  // must not be read as availability nobody confirmed.
  it('treats a leftover "maybe" in stored data as a blocker, not a yes', () => {
    const t = tallySlot('s1', votes([['u1', 'yes'], ['u2', 'maybe' as Choice]]), 2);
    expect(t).toMatchObject({ yes: 1, no: 1 });
    expect(t.everyoneCanMake).toBe(false);
  });

  it('reports how many invitees have not answered', () => {
    const t = tallySlot('s1', votes([['u1', 'yes']]), 4);
    expect(t.pending).toBe(3);
  });

  it('never reports negative pending when extra people voted', () => {
    const t = tallySlot('s1', votes([['u1', 'yes'], ['u2', 'no']]), 1);
    expect(t.pending).toBe(0);
  });

  it('flags a slot nobody is blocked on', () => {
    expect(tallySlot('s1', votes([['u1', 'yes'], ['u2', 'yes']]), 2).everyoneCanMake).toBe(true);
    expect(tallySlot('s1', votes([['u1', 'yes'], ['u2', 'no']]), 2).everyoneCanMake).toBe(false);

    // Nobody has said no, but most of the group has not answered: claiming the
    // slot is clear here is how the badge came to contradict the counts beside it.
    expect(tallySlot('s1', votes([['u1', 'yes']]), 10).everyoneCanMake).toBe(false);
  });

  it('does not call an unanswered slot attendable', () => {
    expect(tallySlot('s1', votes([]), 3).everyoneCanMake).toBe(false);
  });
});

describe('rankSlots', () => {
  const make = (over: Partial<SlotTally>): SlotTally => ({
    slotId: 'x',
    yes: 0,
    no: 0,
    pending: 0,
    score: 0,
    everyoneCanMake: false,
    ...over,
  });

  it('puts fewer blockers ahead of a higher score', () => {
    const popular = make({ slotId: 'popular', yes: 5, no: 2, score: 10 });
    const workable = make({ slotId: 'workable', yes: 3, no: 0, score: 6 });
    expect(rankSlots([popular, workable])[0].slotId).toBe('workable');
  });

  it('uses score when blockers are equal', () => {
    const weak = make({ slotId: 'weak', yes: 1, score: 1 });
    const strong = make({ slotId: 'strong', yes: 3, score: 3 });
    expect(rankSlots([weak, strong])[0].slotId).toBe('strong');
  });

  it('leaves genuinely equal slots in their original order', () => {
    const a = make({ slotId: 'a', yes: 1, score: 2 });
    const b = make({ slotId: 'b', yes: 1, score: 2 });
    expect(rankSlots([a, b]).map((t) => t.slotId)).toEqual(['a', 'b']);
  });

  it('does not mutate its input', () => {
    const input = [make({ slotId: 'a', no: 2 }), make({ slotId: 'b', no: 0 })];
    rankSlots(input);
    expect(input.map((t) => t.slotId)).toEqual(['a', 'b']);
  });
});

describe('bestSlot', () => {
  it('returns null while nothing has been answered', () => {
    const untouched = [tallySlot('s1', votes([]), 3), tallySlot('s2', votes([]), 3)];
    expect(bestSlot(untouched)).toBeNull();
  });

  it('ignores slots with no answers when recommending', () => {
    const tallies = [
      tallySlot('empty', votes([]), 3),
      tallySlot('chosen', votes([['u1', 'yes']]), 3),
    ];
    expect(bestSlot(tallies)?.slotId).toBe('chosen');
  });

  it('recommends the slot everyone can make over a more popular one with a blocker', () => {
    const tallies = [
      tallySlot('clash', votes([['u1', 'yes'], ['u2', 'yes'], ['u3', 'no']]), 3),
      tallySlot('clear', votes([['u1', 'yes'], ['u2', 'yes']]), 2),
    ];
    expect(bestSlot(tallies)?.slotId).toBe('clear');
  });
});

// A poll for last Saturday stayed on the dashboard under "answered" and took
// the place a new poll would have. Once every slot has ended it is over.
describe('polls that are over', () => {
  const NOW = new Date('2026-09-23T02:00:00.000Z');
  const poll = (id: string) => ({ id, status: 'open', title: id, created_at: '2026-09-18T00:00:00.000Z' });
  const slots = [
    { id: 'past', poll_id: 'old', end_at: '2026-09-19T11:00:00.000Z' },
    { id: 'p1', poll_id: 'mixed', end_at: '2026-09-19T11:00:00.000Z' },
    { id: 'p2', poll_id: 'mixed', end_at: '2026-09-26T11:00:00.000Z' },
  ];

  it('drops a poll whose every slot has ended, and keeps one with time left', () => {
    const shown = openPolls([poll('old'), poll('mixed'), poll('empty')], slots, [], 'me', NOW).map((r) => r.poll.id);
    expect(shown).toEqual(['old', 'mixed', 'empty'].filter((id) => id !== 'old'));
  });

  it('does not call a poll with no slots over', () => {
    expect(pollIsOver([], NOW)).toBe(false);
  });
});
