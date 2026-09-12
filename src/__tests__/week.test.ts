import { describe, it, expect } from 'vitest';
import { weekKey, weekStartDate, recentWeekKeys, weeksAgo } from '../lib/week';

describe('weekKey', () => {
  it('numbers a plain mid-year week', () => {
    // 2026-09-13 is a Sunday, the last day of ISO week 37.
    expect(weekKey(new Date(2026, 8, 13))).toBe('2026-W37');
    // The next day starts week 38.
    expect(weekKey(new Date(2026, 8, 14))).toBe('2026-W38');
  });

  it('keeps Monday and Sunday of the same week together', () => {
    const monday = weekKey(new Date(2026, 8, 14));
    const sunday = weekKey(new Date(2026, 8, 20));
    expect(monday).toBe(sunday);
  });

  it('assigns a late-December date to the next ISO year when the week is', () => {
    // 2025-12-29 is a Monday whose Thursday falls in 2026, so it is 2026-W01.
    expect(weekKey(new Date(2025, 11, 29))).toBe('2026-W01');
  });

  it('assigns an early-January date to the previous ISO year when the week is', () => {
    // 2027-01-01 is a Friday in the week whose Thursday is 2026-12-31.
    expect(weekKey(new Date(2027, 0, 1))).toBe('2026-W53');
  });
});

describe('weekStartDate', () => {
  it('returns the Monday that opens the week', () => {
    expect(weekStartDate('2026-W38')).toBe('2026-09-14');
  });

  it('round-trips with weekKey', () => {
    for (const date of [
      new Date(2026, 0, 1),
      new Date(2026, 5, 30),
      new Date(2026, 8, 13),
      new Date(2026, 11, 31),
    ]) {
      const key = weekKey(date);
      const start = weekStartDate(key);
      expect(start).not.toBeNull();
      expect(weekKey(new Date(start + 'T00:00:00Z'))).toBe(key);
    }
  });

  it('rejects anything it did not produce', () => {
    expect(weekStartDate('2026-38')).toBeNull();
    expect(weekStartDate('week 38')).toBeNull();
    expect(weekStartDate('')).toBeNull();
  });
});

describe('recentWeekKeys', () => {
  it('counts back from the given week, newest first', () => {
    expect(recentWeekKeys(3, new Date(2026, 8, 14))).toEqual([
      '2026-W38',
      '2026-W37',
      '2026-W36',
    ]);
  });

  it('crosses a year boundary without repeating a key', () => {
    const keys = recentWeekKeys(6, new Date(2026, 0, 10));
    expect(new Set(keys).size).toBe(6);
  });
});

describe('weeksAgo', () => {
  it('reports 0 for the current week', () => {
    expect(weeksAgo('2026-W38', new Date(2026, 8, 16))).toBe(0);
  });

  it('counts whole weeks back', () => {
    expect(weeksAgo('2026-W35', new Date(2026, 8, 16))).toBe(3);
  });

  it('returns null for a malformed key', () => {
    expect(weeksAgo('nonsense', new Date(2026, 8, 16))).toBeNull();
  });
});
