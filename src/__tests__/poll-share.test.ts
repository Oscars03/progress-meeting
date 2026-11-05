import { describe, it, expect } from 'vitest';
import { loginHref, safeReturnPath } from '@/lib/return-path';
import { displayPollTitle, pollWhenLabel } from '@/lib/poll-title';

describe('safeReturnPath', () => {
  it('keeps a path on this site, query included', () => {
    expect(safeReturnPath('/meetings/polls/abc')).toBe('/meetings/polls/abc');
    expect(safeReturnPath('/tasks?round=2')).toBe('/tasks?round=2');
  });

  it('refuses anything a browser would read as another host', () => {
    expect(safeReturnPath('https://evil.example/')).toBeNull();
    expect(safeReturnPath('//evil.example')).toBeNull();
    expect(safeReturnPath('/\\evil.example')).toBeNull();
    expect(safeReturnPath('javascript:alert(1)')).toBeNull();
  });

  it('refuses the sign-in page itself and API routes', () => {
    expect(safeReturnPath('/login')).toBeNull();
    expect(safeReturnPath('/login?callbackUrl=%2Ftasks')).toBeNull();
    expect(safeReturnPath('/api/cron')).toBeNull();
  });

  it('refuses nothing at all', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
    expect(safeReturnPath('')).toBeNull();
  });
});

describe('loginHref', () => {
  it('carries the page asked for', () => {
    expect(loginHref('/meetings/polls/abc')).toBe('/login?callbackUrl=%2Fmeetings%2Fpolls%2Fabc');
  });

  it('is plain /login where signing in would land anyway, or nothing safe was asked for', () => {
    expect(loginHref('/')).toBe('/login');
    expect(loginHref('/dashboard')).toBe('/login');
    expect(loginHref(null)).toBe('/login');
    expect(loginHref('//evil.example')).toBe('/login');
  });
});

describe('displayPollTitle', () => {
  // Fri 6 Nov 2026, 11:00-13:00 in Bangkok.
  const slot = { start_at: '2026-11-06T04:00:00.000Z', end_at: '2026-11-06T06:00:00.000Z' };

  it('rebuilds a generated English title for a Thai reader', () => {
    const title = displayPollTitle('Confirm meeting time Fri 6 Nov 11:00–13:00', [slot], 'th');
    expect(title.startsWith('ยืนยันเวลาประชุม ')).toBe(true);
    expect(title).toContain('11:00–13:00');
    expect(title).not.toContain('Confirm');
  });

  it('rebuilds a generated Thai title for an English reader', () => {
    const stored = displayPollTitle('Confirm meeting time Fri 6 Nov 11:00–13:00', [slot], 'th');
    expect(displayPollTitle(stored, [slot], 'en')).toBe('Confirm meeting time Fri 6 Nov 11:00–13:00');
  });

  it('reads the time in the lab, not on the server', () => {
    expect(pollWhenLabel(slot.start_at, slot.end_at, 'en')).toBe('Fri 6 Nov 11:00–13:00');
  });

  it('leaves a typed title alone', () => {
    expect(displayPollTitle('Progress meeting week 45', [slot], 'en')).toBe('Progress meeting week 45');
  });

  it('leaves a title alone when the poll does not ask about exactly one slot', () => {
    const stored = 'Confirm meeting time Fri 6 Nov 11:00–13:00';
    expect(displayPollTitle(stored, [], 'th')).toBe(stored);
    expect(displayPollTitle(stored, [slot, slot], 'th')).toBe(stored);
  });
});
