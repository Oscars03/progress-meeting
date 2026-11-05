import { describe, it, expect } from 'vitest';
import { pollProgress } from '@/lib/poll-tally';

const slots = [
  { id: 's1', poll_id: 'p1' },
  { id: 's2', poll_id: 'p1' },
  { id: 'x1', poll_id: 'other' },
];
const vote = (user_id: string, slot_id: string, choice = 'yes') => ({ user_id, slot_id, choice });

describe('pollProgress', () => {
  it('counts somebody as done only once every slot has an answer', () => {
    const votes = [vote('a', 's1'), vote('a', 's2', 'no'), vote('b', 's1')];
    expect(pollProgress('p1', slots, votes, ['a', 'b', 'c'])).toEqual({ done: ['a'], waiting: ['b', 'c'] });
  });

  it('ignores votes on another poll and votes from outside the people asked', () => {
    const votes = [vote('c', 'x1'), vote('admin', 's1'), vote('admin', 's2')];
    expect(pollProgress('p1', slots, votes, ['c'])).toEqual({ done: [], waiting: ['c'] });
  });

  it('ignores a choice that is not an answer', () => {
    const votes = [vote('a', 's1'), vote('a', 's2', 'maybe')];
    expect(pollProgress('p1', slots, votes, ['a'])).toEqual({ done: [], waiting: ['a'] });
  });

  it('keeps the order the people were given in', () => {
    const votes = [vote('c', 's1'), vote('c', 's2'), vote('a', 's1'), vote('a', 's2')];
    expect(pollProgress('p1', slots, votes, ['a', 'b', 'c']).done).toEqual(['a', 'c']);
  });

  it('counts nobody as done on a poll with no slots', () => {
    expect(pollProgress('empty', slots, [], ['a'])).toEqual({ done: [], waiting: ['a'] });
  });
});
