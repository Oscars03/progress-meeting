import { describe, it, expect } from 'vitest';
import {
  DAY_FROM,
  DAY_TO,
  freeTogether,
  generateShareToken,
  hashShareToken,
  renderShareSvg,
  segmentsInWeek,
  shareIsLive,
  weekDays,
} from '../lib/calendar-share';

// 2026-W44 starts on Monday 26 October.
const WEEK = '2026-W44';
const at = (day: string, time: string) => `2026-10-${day}T${time}:00+07:00`;

describe('weekDays', () => {
  it('is the seven lab midnights from Monday', () => {
    const days = weekDays(WEEK);
    expect(days).toHaveLength(7);
    expect(new Date(days[0]).toISOString()).toBe('2026-10-25T17:00:00.000Z');
    expect(new Date(days[6]).toISOString()).toBe('2026-10-31T17:00:00.000Z');
  });
});

describe('segmentsInWeek', () => {
  it('places a block on its day in lab minutes', () => {
    expect(segmentsInWeek([{ start: at('27', '09:00'), end: at('27', '10:30') }], WEEK)).toEqual([
      { day: 1, from: 540, to: 630 },
    ]);
  });

  it('cuts a block to the drawn hours', () => {
    expect(segmentsInWeek([{ start: at('26', '06:00'), end: at('26', '09:00') }], WEEK)).toEqual([
      { day: 0, from: DAY_FROM, to: 540 },
    ]);
    expect(segmentsInWeek([{ start: at('26', '23:00'), end: at('27', '01:00') }], WEEK)).toEqual([]);
  });

  it('puts a block that runs past midnight on both days', () => {
    expect(segmentsInWeek([{ start: at('26', '21:00'), end: at('27', '09:00') }], WEEK)).toEqual([
      { day: 0, from: 1260, to: DAY_TO },
      { day: 1, from: DAY_FROM, to: 540 },
    ]);
  });

  it('merges blocks that overlap or touch', () => {
    expect(
      segmentsInWeek(
        [
          { start: at('28', '10:00'), end: at('28', '12:00') },
          { start: at('28', '11:00'), end: at('28', '13:00') },
          { start: at('28', '13:00'), end: at('28', '14:00') },
        ],
        WEEK
      )
    ).toEqual([{ day: 2, from: 600, to: 840 }]);
  });

  it('ignores a week outside it and an unreadable time', () => {
    expect(segmentsInWeek([{ start: '2026-11-03T10:00:00+07:00', end: '2026-11-03T11:00:00+07:00' }], WEEK)).toEqual([]);
    expect(segmentsInWeek([{ start: 'soon', end: 'later' }], WEEK)).toEqual([]);
  });
});

describe('freeTogether', () => {
  it('is the drawn hours nobody shown is busy in', () => {
    const free = freeTogether([[{ day: 0, from: 540, to: 600 }], [{ day: 0, from: 570, to: 720 }]]);
    expect(free.filter((s) => s.day === 0)).toEqual([
      { day: 0, from: DAY_FROM, to: 540 },
      { day: 0, from: 720, to: DAY_TO },
    ]);
    expect(free.filter((s) => s.day === 1)).toEqual([{ day: 1, from: DAY_FROM, to: DAY_TO }]);
  });
});

describe('a share link', () => {
  it('is a long random token, stored only as its hash', () => {
    const token = generateShareToken();
    expect(token).toMatch(/^pmc_[A-Za-z0-9_-]{43}$/);
    expect(generateShareToken()).not.toBe(token);
    expect(hashShareToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashShareToken(token)).toBe(hashShareToken(token));
  });

  it('stops working when withdrawn or past its date', () => {
    const now = new Date('2026-10-27T00:00:00Z');
    expect(shareIsLive({ expires_at: '2026-11-26T00:00:00Z', revoked_at: '' }, now)).toBe(true);
    expect(shareIsLive({ expires_at: '2026-10-26T00:00:00Z', revoked_at: '' }, now)).toBe(false);
    expect(shareIsLive({ expires_at: '2026-11-26T00:00:00Z', revoked_at: '2026-10-26T00:00:00Z' }, now)).toBe(false);
    expect(shareIsLive({ expires_at: '', revoked_at: '' }, now)).toBe(false);
  });
});

describe('renderShareSvg', () => {
  const labels = {
    title: 'Busy',
    range: '26 Oct – 1 Nov',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    lab: 'Lab',
    meetings: 'Meetings',
    free: 'Free',
    note: 'note',
  };

  it('escapes names, so a name cannot add markup to the page it is shown on', () => {
    const svg = renderShareSvg({
      rows: [{ name: '<script>x</script>', color: 'red', busy: [{ day: 0, from: 540, to: 600 }] }],
      meetings: [],
      labels,
    });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('draws a bar for each busy block', () => {
    const svg = renderShareSvg({
      rows: [{ name: 'A', color: 'blue', busy: [{ day: 0, from: 540, to: 600 }, { day: 3, from: 600, to: 660 }] }],
      meetings: [],
      labels,
    });
    expect(svg.match(/fill="#dbeafe" stroke="#1e40af"/g)).toHaveLength(2);
  });
});
