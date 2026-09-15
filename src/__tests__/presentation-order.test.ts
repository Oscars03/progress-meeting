import { describe, it, expect } from 'vitest';
import {
  topicsForWeek,
  suggestTopicOrder,
  effectiveTopicOrder,
  topicCounts,
  groupByPresenter,
  flattenPresenters,
} from '../lib/presentation-order';
import { readStatus } from '../app/(app)/tasks/statuses';
import type { TopicRecord } from '../lib/db/schema';

function topic(
  id: string,
  owner: string,
  createdAt: string,
  extra: Partial<TopicRecord> = {},
): TopicRecord {
  return {
    id,
    created_at: createdAt,
    updated_at: createdAt,
    row_version: 1,
    created_by: owner,
    title: id,
    details: '',
    owner_id: owner,
    week_key: '2026-W38',
    meeting_id: '',
    present_order: '',
    status: 'planned',
    ...extra,
  };
}

describe('topicsForWeek', () => {
  it('keeps only the asked-for week and drops dropped topics', () => {
    const topics = [
      topic('a', 'stu1', '2026-09-14T09:00:00.000Z'),
      topic('b', 'stu1', '2026-09-14T09:00:00.000Z', { week_key: '2026-W37' }),
      topic('c', 'stu2', '2026-09-14T09:00:00.000Z', { status: 'dropped' }),
    ];

    expect(topicsForWeek(topics, '2026-W38').map((t) => t.id)).toEqual(['a']);
  });
});

describe('suggestTopicOrder', () => {
  it('puts the person with the most topics first', () => {
    const topics = [
      topic('one', 'stu1', '2026-09-14T09:00:00.000Z'),
      topic('two-a', 'stu2', '2026-09-14T10:00:00.000Z'),
      topic('two-b', 'stu2', '2026-09-14T10:05:00.000Z'),
    ];

    expect(suggestTopicOrder(topics).map((t) => t.owner_id)).toEqual(['stu2', 'stu2', 'stu1']);
  });

  it('breaks a tie on who wrote theirs down first', () => {
    const topics = [
      topic('late', 'stu2', '2026-09-14T11:00:00.000Z'),
      topic('early', 'stu1', '2026-09-14T09:00:00.000Z'),
    ];

    expect(suggestTopicOrder(topics).map((t) => t.id)).toEqual(['early', 'late']);
  });

  it("keeps one person's own topics in the order they wrote them", () => {
    const topics = [
      topic('second', 'stu1', '2026-09-14T10:00:00.000Z'),
      topic('first', 'stu1', '2026-09-14T09:00:00.000Z'),
    ];

    expect(suggestTopicOrder(topics).map((t) => t.id)).toEqual(['first', 'second']);
  });
});

describe('effectiveTopicOrder', () => {
  it('falls back to the suggestion when nothing has been arranged', () => {
    const topics = [
      topic('solo', 'stu1', '2026-09-14T09:00:00.000Z'),
      topic('pair-a', 'stu2', '2026-09-14T10:00:00.000Z'),
      topic('pair-b', 'stu2', '2026-09-14T10:05:00.000Z'),
    ];

    const { ordered, custom } = effectiveTopicOrder(topics);
    expect(custom).toBe(false);
    expect(ordered.map((t) => t.id)).toEqual(['pair-a', 'pair-b', 'solo']);
  });

  it('uses the stored order once someone has arranged it, beating the suggestion', () => {
    const topics = [
      topic('pair-a', 'stu2', '2026-09-14T10:00:00.000Z', { present_order: 2 }),
      topic('pair-b', 'stu2', '2026-09-14T10:05:00.000Z', { present_order: 3 }),
      topic('solo', 'stu1', '2026-09-14T09:00:00.000Z', { present_order: 1 }),
    ];

    const { ordered, custom } = effectiveTopicOrder(topics);
    expect(custom).toBe(true);
    expect(ordered.map((t) => t.id)).toEqual(['solo', 'pair-a', 'pair-b']);
  });

  it('adds a newly written topic to the end rather than letting it jump the queue', () => {
    const topics = [
      topic('placed', 'stu1', '2026-09-14T09:00:00.000Z', { present_order: 1 }),
      topic('new-a', 'stu2', '2026-09-14T11:00:00.000Z'),
      topic('new-b', 'stu2', '2026-09-14T11:05:00.000Z'),
    ];

    expect(effectiveTopicOrder(topics).ordered.map((t) => t.id)).toEqual([
      'placed',
      'new-a',
      'new-b',
    ]);
  });
});

describe('topicCounts', () => {
  it('counts per person', () => {
    const topics = [
      topic('a', 'stu1', '2026-09-14T09:00:00.000Z'),
      topic('b', 'stu2', '2026-09-14T09:00:00.000Z'),
      topic('c', 'stu2', '2026-09-14T09:00:00.000Z'),
    ];

    const counts = topicCounts(topics);
    expect(counts.get('stu1')).toBe(1);
    expect(counts.get('stu2')).toBe(2);
  });
});

describe('groupByPresenter', () => {
  const topic = (id: string, owner: string, at = '2026-09-01T00:00:00.000Z') =>
    ({ id, owner_id: owner, created_at: at, present_order: '', week_key: '2026-W38', status: 'planned' }) as TopicRecord;

  it('turns a flat order into one block per person, keeping the order it was given', () => {
    const blocks = groupByPresenter([
      topic('a1', 'ann'),
      topic('a2', 'ann'),
      topic('b1', 'bob'),
    ]);

    expect(blocks.map((b) => b.ownerId)).toEqual(['ann', 'bob']);
    expect(blocks[0].topics.map((t) => t.id)).toEqual(['a1', 'a2']);
  });

  // The point of the change: one person is called on once, not once per topic.
  it("gathers a person's topics even when they arrive scattered", () => {
    const blocks = groupByPresenter([
      topic('a1', 'ann'),
      topic('b1', 'bob'),
      topic('a2', 'ann'),
    ]);

    expect(blocks.map((b) => b.ownerId)).toEqual(['ann', 'bob']);
    expect(blocks[0].topics.map((t) => t.id)).toEqual(['a1', 'a2']);
    expect(blocks[1].topics.map((t) => t.id)).toEqual(['b1']);
  });

  it('places a person where their first topic fell, not their last', () => {
    const blocks = groupByPresenter([
      topic('b1', 'bob'),
      topic('a1', 'ann'),
      topic('b2', 'bob'),
    ]);
    expect(blocks.map((b) => b.ownerId)).toEqual(['bob', 'ann']);
  });

  it('has nothing to group when the week is empty', () => {
    expect(groupByPresenter([])).toEqual([]);
  });
});

describe('flattenPresenters', () => {
  const topic = (id: string, owner: string) =>
    ({ id, owner_id: owner, created_at: '2026-09-01T00:00:00.000Z', present_order: '', week_key: '2026-W38', status: 'planned' }) as TopicRecord;

  it('round-trips a grouped order back to the topic order that gets stored', () => {
    const flat = [topic('a1', 'ann'), topic('a2', 'ann'), topic('b1', 'bob')];
    expect(flattenPresenters(groupByPresenter(flat)).map((t) => t.id)).toEqual(['a1', 'a2', 'b1']);
  });

  it('moves every topic of a person when the person moves', () => {
    const blocks = groupByPresenter([topic('a1', 'ann'), topic('a2', 'ann'), topic('b1', 'bob')]);
    // Bob is dragged above Ann.
    const reordered = [blocks[1], blocks[0]];
    expect(flattenPresenters(reordered).map((t) => t.id)).toEqual(['b1', 'a1', 'a2']);
  });
});

describe('readStatus', () => {
  it('keeps a status that is still offered', () => {
    expect(readStatus('in_progress')).toBe('in_progress');
    expect(readStatus('done')).toBe('done');
  });

  // Eight columns became five, then three. Rows written before either change
  // still carry the old value, and a board that dropped them would lose work
  // rather than move it.
  it('lands a retired status in the column that replaced it', () => {
    expect(readStatus('draft')).toBe('not_started');
    expect(readStatus('assigned')).toBe('not_started');
    expect(readStatus('presented')).toBe('done');
    expect(readStatus('follow_up')).toBe('in_progress');
  });

  // Both of the ones just retired are about *why* work is in flight, not
  // whether it is -- and "ready to present" is emphatically not finished:
  // reading it as done would mark complete something nobody has seen.
  it('reads stuck and awaiting-a-meeting as still under way, not done', () => {
    expect(readStatus('blocked')).toBe('in_progress');
    expect(readStatus('ready_to_present')).toBe('in_progress');
  });

  it('falls back rather than losing a row it cannot read at all', () => {
    expect(readStatus('')).toBe('not_started');
    expect(readStatus('something-else')).toBe('not_started');
  });
});
