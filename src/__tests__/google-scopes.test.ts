/**
 * What the app asks Google for, and what a sign-in is allowed to overwrite.
 *
 * Signing in used to ask for the calendar as well as identity. Google treats
 * calendar access as sensitive and puts it behind its own screens, so a new
 * member's first sign-in became several consent prompts for access the app did
 * not need yet -- ending on a page telling them to wait for an admin.
 *
 * Splitting the two asks creates a second hazard, which the guard here exists
 * for: a sign-in now grants no calendar access, and must not be allowed to
 * speak for the calendar connection because of it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  IDENTITY_SCOPES,
  CALENDAR_SCOPES,
  calendarAuthParams,
  grantsCalendar,
} from '../lib/google/scopes';

const find = vi.fn(async () => [] as unknown[]);
const update = vi.fn(async () => ({}));
const insert = vi.fn(async () => ({}));

vi.mock('../lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: (...a: unknown[]) => find(...(a as [])),
    update: (...a: unknown[]) => update(...(a as [])),
    insert: (...a: unknown[]) => insert(...(a as [])),
  },
}));
vi.mock('../lib/secret-box', () => ({
  encryptSecret: (v: string) => `enc:${v}`,
  decryptSecret: (v: string) => (v.startsWith('enc:') ? v.slice(4) : v),
}));

const { storeRefreshToken } = await import('../lib/google/tokens');

const SIGN_IN_SCOPE = IDENTITY_SCOPES.join(' ');
const CONNECT_SCOPE = [...IDENTITY_SCOPES, ...CALENDAR_SCOPES].join(' ');

beforeEach(() => {
  find.mockReset().mockResolvedValue([]);
  update.mockReset().mockResolvedValue({});
  insert.mockReset().mockResolvedValue({});
});

describe('what each flow asks for', () => {
  it('keeps the calendar out of the sign-in scopes', () => {
    expect(grantsCalendar(SIGN_IN_SCOPE)).toBe(false);
    for (const scope of CALENDAR_SCOPES) {
      expect(IDENTITY_SCOPES).not.toContain(scope);
    }
  });

  it('asks for the calendar on the Connect press, with an offline grant', () => {
    const params = calendarAuthParams();
    expect(grantsCalendar(params.scope)).toBe(true);
    // Without offline there is no refresh token, and without a forced consent
    // Google returns one only on somebody's very first approval.
    expect(params.access_type).toBe('offline');
    expect(params.prompt).toBe('consent');
  });

  it('still identifies the person on the Connect press', () => {
    for (const scope of IDENTITY_SCOPES) {
      expect(calendarAuthParams().scope).toContain(scope);
    }
  });
});

describe('a sign-in must not speak for the calendar connection', () => {
  const connected = [
    {
      id: 'gt1',
      user_id: 'u1',
      refresh_token: 'enc:good-token',
      scope: CONNECT_SCOPE,
      account_email: 'a@test.com',
      row_version: 3,
    },
  ];

  it('leaves a working connection alone when someone merely signs in', async () => {
    find.mockResolvedValue(connected);

    await storeRefreshToken({
      userId: 'u1',
      refreshToken: 'a-sign-in-token',
      scope: SIGN_IN_SCOPE,
      accountEmail: 'a@test.com',
    });

    // The dangerous case: a token that cannot read a calendar replacing one
    // that can, leaving the row looking connected and reading nothing.
    expect(update).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not rewrite the stored scope on a sign-in that returns no token', async () => {
    find.mockResolvedValue(connected);

    await storeRefreshToken({
      userId: 'u1',
      refreshToken: null,
      scope: SIGN_IN_SCOPE,
      accountEmail: 'a@test.com',
    });

    expect(update).not.toHaveBeenCalled();
  });

  it('stores the grant when the Connect press actually returns one', async () => {
    find.mockResolvedValue([]);

    await storeRefreshToken({
      userId: 'u1',
      refreshToken: 'calendar-token',
      scope: CONNECT_SCOPE,
      accountEmail: 'a@test.com',
    });

    expect(insert).toHaveBeenCalledWith(
      'google_tokens',
      expect.objectContaining({ user_id: 'u1', refresh_token: 'enc:calendar-token' }),
      'u1'
    );
  });

  it('keeps the existing token when a Connect press returns none, rather than wiping it', async () => {
    find.mockResolvedValue(connected);

    await storeRefreshToken({
      userId: 'u1',
      refreshToken: undefined,
      scope: CONNECT_SCOPE,
      accountEmail: 'a@test.com',
    });

    expect(update).toHaveBeenCalledWith(
      'google_tokens',
      'gt1',
      expect.not.objectContaining({ refresh_token: expect.anything() }),
      3,
      'u1'
    );
  });
});
