import { describe, it, expect } from 'vitest';
import { needsBusyTimes, type BusyNudgeInput } from '../lib/busy-nudge';
import type { MeetingRecord, PersonalEventRecord } from '../lib/db/schema';

// 2026-W44 runs Monday 26 Oct to Sunday 1 Nov.
const WEEK = '2026-W44';

const meeting = (start_at: string, status = 'scheduled') =>
  ({ id: start_at, start_at, end_at: start_at, status } as MeetingRecord);
const busy = (user_id: string, start_at: string, end_at: string) =>
  ({ id: start_at, user_id, start_at, end_at } as PersonalEventRecord);

function input(over: Partial<BusyNudgeInput> = {}): BusyNudgeInput {
  return {
    userId: 'me',
    week: WEEK,
    isBreak: false,
    meetings: [],
    personalEvents: [],
    connected: new Set(),
    openPollCount: 0,
    ...over,
  };
}

describe('needsBusyTimes', () => {
  it('asks somebody with nothing marked while the week has no meeting', () => {
    expect(needsBusyTimes(input())).toBe(true);
  });

  it('stops asking once they block out any hour that week', () => {
    expect(needsBusyTimes(input({ personalEvents: [busy('me', '2026-10-27T09:00', '2026-10-27T12:00')] }))).toBe(false);
  });

  it('counts the week by the lab clock at both ends', () => {
    // 00:30 on Monday in the lab is still Sunday in UTC.
    expect(needsBusyTimes(input({ personalEvents: [busy('me', '2026-10-26T00:30', '2026-10-26T01:00')] }))).toBe(false);
    // Late on the Sunday before is the week before, however it looks in UTC.
    expect(needsBusyTimes(input({ personalEvents: [busy('me', '2026-10-25T22:00', '2026-10-25T23:30')] }))).toBe(true);
  });

  it("is not satisfied by somebody else's hours, or by another week's", () => {
    const personalEvents = [
      busy('you', '2026-10-27T09:00', '2026-10-27T12:00'),
      busy('me', '2026-11-03T09:00', '2026-11-03T12:00'),
    ];
    expect(needsBusyTimes(input({ personalEvents }))).toBe(true);
  });

  it('does not ask somebody whose Google calendar the grid already reads', () => {
    expect(needsBusyTimes(input({ connected: new Set(['me']) }))).toBe(false);
  });

  it('does not ask once the week has a meeting, but does if it was cancelled', () => {
    expect(needsBusyTimes(input({ meetings: [meeting('2026-10-29T03:00:00.000Z')] }))).toBe(false);
    expect(needsBusyTimes(input({ meetings: [meeting('2026-10-29T03:00:00.000Z', 'cancelled')] }))).toBe(true);
  });

  it("ignores a meeting in another week", () => {
    expect(needsBusyTimes(input({ meetings: [meeting('2026-11-05T03:00:00.000Z')] }))).toBe(true);
  });

  it('does not ask while a poll is open, or during a break', () => {
    expect(needsBusyTimes(input({ openPollCount: 1 }))).toBe(false);
    expect(needsBusyTimes(input({ isBreak: true }))).toBe(false);
  });
});
