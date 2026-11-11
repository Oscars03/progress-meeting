import { describe, it, expect } from 'vitest';
import {
  weekKey,
  weekStartDate,
  nextWeekKey,
  recentWeekKeys,
  weeksAgo,
  previousWeekKey,
  isRealWeekKey,
  monthOfWeek,
  weeksOfMonth,
  weeksTouchingMonth,
  shiftMonth,
  isMonthKey,
} from '../lib/week';

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

describe('nextWeekKey', () => {
  it('moves to the following ISO week', () => {
    expect(nextWeekKey('2026-W37')).toBe('2026-W38');
  });

  it('crosses a year boundary correctly', () => {
    // The Monday before 2026-W01 starts is the last week of ISO year 2025.
    const lastWeekOf2025 = weekKey(new Date(2025, 11, 22));
    expect(nextWeekKey(lastWeekOf2025)).toBe('2026-W01');
  });

  it('agrees with stepping the underlying date by 7 days', () => {
    for (const date of [new Date(2026, 0, 1), new Date(2026, 5, 30), new Date(2026, 11, 31)]) {
      const stepped = new Date(date);
      stepped.setDate(stepped.getDate() + 7);
      expect(nextWeekKey(weekKey(date))).toBe(weekKey(stepped));
    }
  });

  it('leaves a malformed key unchanged', () => {
    expect(nextWeekKey('nonsense')).toBe('nonsense');
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

describe('previousWeekKey', () => {
  it('steps back one week', () => {
    expect(previousWeekKey('2026-W47')).toBe('2026-W46');
  });

  it('crosses into a 53-week year', () => {
    expect(previousWeekKey('2027-W01')).toBe('2026-W53');
  });

  it('crosses into a 52-week year', () => {
    expect(previousWeekKey('2026-W01')).toBe('2025-W52');
  });

  it('mirrors nextWeekKey', () => {
    expect(nextWeekKey(previousWeekKey('2026-W30'))).toBe('2026-W30');
  });
});

describe('isRealWeekKey', () => {
  it('accepts weeks that exist', () => {
    expect(isRealWeekKey('2026-W46')).toBe(true);
    expect(isRealWeekKey('2026-W53')).toBe(true);
  });

  it('refuses weeks that do not', () => {
    expect(isRealWeekKey('2025-W53')).toBe(false);
    expect(isRealWeekKey('2026-W60')).toBe(false);
    expect(isRealWeekKey('2026-W00')).toBe(false);
    expect(isRealWeekKey('2026-46')).toBe(false);
    expect(isRealWeekKey(undefined)).toBe(false);
  });
});

describe('months of weeks', () => {
  it('puts a week in the month of its Thursday', () => {
    // 30 Nov - 6 Dec 2026: Thursday is 3 Dec.
    expect(monthOfWeek('2026-W49')).toBe('2026-12');
    // 28 Dec 2026 - 3 Jan 2027: Thursday is 31 Dec.
    expect(monthOfWeek('2026-W53')).toBe('2026-12');
  });

  it('lists each week in exactly one month', () => {
    expect(weeksOfMonth('2026-11')).toEqual(['2026-W45', '2026-W46', '2026-W47', '2026-W48']);
    expect(weeksOfMonth('2026-12')).toEqual(['2026-W49', '2026-W50', '2026-W51', '2026-W52', '2026-W53']);
    expect(weeksOfMonth('2027-01')[0]).toBe('2027-W01');
  });

  it('gives a grid every week touching the month', () => {
    expect(weeksTouchingMonth('2026-11')).toEqual([
      '2026-W44',
      '2026-W45',
      '2026-W46',
      '2026-W47',
      '2026-W48',
      '2026-W49',
    ]);
  });

  it('steps months across a year', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('refuses a month that is not one', () => {
    expect(isMonthKey('2026-13')).toBe(false);
    expect(weeksOfMonth('nonsense')).toEqual([]);
  });
});
