import { describe, it, expect } from 'vitest';
import {
  topicsForWeek,
  suggestTopicOrder,
  effectiveTopicOrder,
  topicCounts,
} from '../lib/presentation-order';
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
