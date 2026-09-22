import { describe, it, expect } from 'vitest';
import {
  daysBetween,
  elapsedPct,
  formatDay,
  isDay,
  monthOffset,
  projectHealth,
  readSubtasks,
  timelineWindow,
  MAX_MONTHS,
  MIN_MONTHS,
  STALE_AFTER_DAYS,
} from '../lib/tracker';

const TODAY = '2026-09-23';

describe('isDay', () => {
  it('takes a real calendar date and nothing else', () => {
    expect(isDay('2026-02-28')).toBe(true);
    expect(isDay('2026-02-30')).toBe(false);
    expect(isDay('2026-9-3')).toBe(false);
    expect(isDay('')).toBe(false);
    expect(isDay(undefined)).toBe(false);
  });
});

describe('elapsedPct', () => {
  it('counts both end days, so the last day is 100%', () => {
    expect(elapsedPct('2026-09-01', '2026-09-10', '2026-09-10')).toBe(100);
    expect(elapsedPct('2026-09-01', '2026-09-10', '2026-09-05')).toBe(50);
  });

  it('stays within 0-100 before the start and after the end', () => {
    expect(elapsedPct('2026-10-01', '2026-10-31', TODAY)).toBe(0);
    expect(elapsedPct('2026-06-01', '2026-07-01', TODAY)).toBe(100);
  });

  it('has nothing to say without a due date', () => {
    expect(elapsedPct('2026-09-01', '', TODAY)).toBeNull();
  });
});

describe('projectHealth', () => {
  const base = { status: 'in_progress', start: '2026-06-01', due: '2026-10-31', progress: 70, lastUpdate: TODAY };

  it('reads delivered work as delivered, whatever else is true', () => {
    expect(projectHealth({ ...base, status: 'done', progress: 10, lastUpdate: null }, TODAY)).toBe('done');
  });

  it('expects nothing yet of work that has not started', () => {
    expect(projectHealth({ ...base, start: '2026-10-01', progress: 0, lastUpdate: null }, TODAY)).toBe('ok');
  });

  // Silence comes before lateness: an untouched figure says nothing either way.
  it('reports silence before lateness', () => {
    expect(projectHealth({ ...base, progress: 0, lastUpdate: null }, TODAY)).toBe('stale');
    expect(projectHealth({ ...base, lastUpdate: '2026-09-10' }, TODAY)).toBe('stale');
  });

  it('allows a week and a day before calling it silent', () => {
    const edge = '2026-09-15'; // eight days before TODAY
    expect(daysBetween(edge, TODAY)).toBe(STALE_AFTER_DAYS);
    expect(projectHealth({ ...base, lastUpdate: edge }, TODAY)).not.toBe('stale');
  });

  it('judges progress against the time gone', () => {
    // 2026-06-01 .. 2026-10-31 is 153 days; 115 have gone by TODAY: 75%.
    expect(elapsedPct(base.start, base.due, TODAY)).toBe(75);
    expect(projectHealth({ ...base, progress: 75 }, TODAY)).toBe('ok');
    expect(projectHealth({ ...base, progress: 66 }, TODAY)).toBe('warn');
    expect(projectHealth({ ...base, progress: 40 }, TODAY)).toBe('bad');
  });

  it('cannot call work without a due date behind', () => {
    expect(projectHealth({ ...base, due: '', progress: 0 }, TODAY)).toBe('ok');
  });
});

describe('readSubtasks', () => {
  it('reads what the repository decoded, and what a hand-edit left as text', () => {
    const list = [{ id: 'a', title: 'Collect data', done: true }];
    expect(readSubtasks(list)).toEqual(list);
    expect(readSubtasks(JSON.stringify(list))).toEqual(list);
  });

  it('drops what is not a line of a checklist rather than failing', () => {
    expect(readSubtasks('not json')).toEqual([]);
    expect(readSubtasks({ title: 'x' })).toEqual([]);
    expect(readSubtasks([null, { title: '  ' }, { title: 'Keep', done: 'yes' }])).toEqual([
      { id: 's1', title: 'Keep', done: false },
    ]);
  });
});

describe('timeline', () => {
  it('starts the month before today and runs to the latest date', () => {
    expect(timelineWindow(TODAY, ['2027-10-31'])).toEqual({ start: '2026-08-01', months: 15 });
  });

  it('keeps a quiet board to a readable minimum and a far date to a maximum', () => {
    expect(timelineWindow(TODAY, []).months).toBe(MIN_MONTHS);
    expect(timelineWindow(TODAY, ['2035-01-01']).months).toBe(MAX_MONTHS);
  });

  it('places a day within its month, and a deadline at the close of its day', () => {
    expect(monthOffset('2026-08-01', '2026-09-01')).toBe(1);
    expect(monthOffset('2026-08-01', '2026-09-16')).toBe(1.5);
    expect(monthOffset('2026-08-01', '2026-09-30', true)).toBe(2);
  });
});

describe('formatDay', () => {
  it('writes Thai dates in the Buddhist Era', () => {
    expect(formatDay('2026-10-31', 'th')).toBe('31 ต.ค. 69');
    expect(formatDay('2026-10-31', 'th', true)).toBe('31 ต.ค. 2569');
    expect(formatDay('2026-10-31', 'en', true)).toBe('31 Oct 2026');
  });
});
