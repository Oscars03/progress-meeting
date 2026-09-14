/**
 * The defect these pin down: a time typed into the app was stored as though the
 * server's zone were the lab's. On Vercel the server is UTC, so 08:00 typed in
 * Nakhon Ratchasima became 08:00Z -- 15:00 in Bangkok. The dashboard rendered
 * it server-side, also in UTC, and showed "08:00" back, so the one place it was
 * read looked right while the calendar and Google Calendar both said 15:00.
 *
 * Every case here is written in UTC on purpose, so the test means the same
 * thing on a laptop in Thailand and on a runner in UTC.
 */

import { describe, it, expect } from 'vitest';
import { labInstant, labWallClock, formatLabTime, LAB_TIME_ZONE } from '../lib/lab-time';
import { weekKey } from '../lib/week';

describe('labInstant', () => {
  it('reads a datetime-local value as a time in the lab, not on the server', () => {
    expect(labInstant('2026-09-28T08:00')?.toISOString()).toBe('2026-09-28T01:00:00.000Z');
  });

  it('accepts the seconds form the same way', () => {
    expect(labInstant('2026-09-28T08:00:00')?.toISOString()).toBe('2026-09-28T01:00:00.000Z');
  });

  it('leaves a value that already carries a zone alone', () => {
    // The availability grid builds these with the offset attached already.
    expect(labInstant('2026-09-28T08:00:00+07:00')?.toISOString()).toBe('2026-09-28T01:00:00.000Z');
    expect(labInstant('2026-09-28T01:00:00.000Z')?.toISOString()).toBe('2026-09-28T01:00:00.000Z');
  });

  it('is idempotent, so a stored instant survives being read back and rewritten', () => {
    const once = labInstant('2026-09-28T08:00')!.toISOString();
    expect(labInstant(once)?.toISOString()).toBe(once);
  });

  it('reports nothing rather than an invalid date', () => {
    expect(labInstant('')).toBeNull();
    expect(labInstant('   ')).toBeNull();
    expect(labInstant('not a time')).toBeNull();
    expect(labInstant('2026-13-45T99:99')).toBeNull();
  });

  it('crosses midnight in the right direction', () => {
    // 07:00 Bangkok is exactly midnight UTC; anything earlier is the day before.
    expect(labInstant('2026-09-28T06:00')?.toISOString()).toBe('2026-09-27T23:00:00.000Z');
  });
});

describe('formatLabTime', () => {
  it('shows a stored instant as the lab reads it, whatever zone the server is in', () => {
    const shown = formatLabTime('2026-09-28T01:00:00.000Z', 'en');
    expect(shown).toContain('08:00');
    expect(shown).not.toContain('01:00');
  });

  it('round-trips what someone typed', () => {
    const stored = labInstant('2026-09-28T14:30')!.toISOString();
    expect(formatLabTime(stored, 'en')).toContain('14:30');
  });

  it('renders nothing for a value that is not a time', () => {
    expect(formatLabTime('', 'en')).toBe('');
    expect(formatLabTime('nonsense', 'th')).toBe('');
  });

  it('names a zone the runtime actually knows', () => {
    expect(() => new Date().toLocaleString('en-GB', { timeZone: LAB_TIME_ZONE })).not.toThrow();
  });
});

describe('labWallClock', () => {
  it('shifts an instant so its UTC fields read as the lab clock', () => {
    const lab = labWallClock(new Date('2026-09-28T01:00:00.000Z'));
    expect(lab.getUTCHours()).toBe(8);
    expect(lab.getUTCDate()).toBe(28);
  });
});

describe('weekKey', () => {
  // The bug: Monday 08:00 in Bangkok is Monday 01:00 UTC and files correctly,
  // but Monday 06:00 is Sunday 23:00 UTC -- the week before. Production and a
  // laptop in Thailand disagreed about which week a meeting belonged to.
  it('files early Monday morning in Bangkok under that Monday, not the week before', () => {
    expect(weekKey(new Date('2026-09-27T23:00:00.000Z'))).toBe(weekKey(new Date('2026-09-28T05:00:00.000Z')));
  });

  it('still ends the week at Sunday midnight in the lab', () => {
    // 2026-10-04 is a Sunday. 23:00 there is still that week; 00:00 Monday is not.
    const sundayLate = weekKey(labInstant('2026-10-04T23:00')!);
    const mondayEarly = weekKey(labInstant('2026-10-05T00:00')!);
    expect(sundayLate).not.toBe(mondayEarly);
  });

  it('agrees with itself across an instant expressed two ways', () => {
    expect(weekKey(labInstant('2026-09-28T08:00')!)).toBe(weekKey(new Date('2026-09-28T01:00:00.000Z')));
  });
});
