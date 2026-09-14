/**
 * What the app asks Google for, and when.
 *
 * Its own module because the Connect buttons are client components and
 * `tokens.ts` reaches the spreadsheet: importing these constants from there
 * would drag the sheet client into the browser bundle.
 *
 * The split matters. Signing in asks for identity and nothing else, so a new
 * member gets one ordinary "who are you" screen. Calendar access is a separate
 * ask, made by the Connect button at the moment somebody chooses to connect --
 * which is also the only press that must come back with a refresh token.
 *
 * Bundling them meant a new member was asked to hand over their calendar just
 * to log in: Google treats these as sensitive scopes and puts them behind
 * their own screens, so a first sign-in became several prompts for access the
 * app did not need yet, ending on a page that told them to wait for approval.
 */

/** Enough to know who signed in. Nothing else. */
export const IDENTITY_SCOPES = ['openid', 'email', 'profile'];

/**
 * calendar.events is write access to events only -- it cannot create or delete
 * whole calendars, or read the person's settings. calendar.readonly is what
 * lets the app see busy times on their other calendars when suggesting a
 * meeting slot. Asking for plain `calendar` would cover both and more, which
 * is more than this app does.
 */
export const CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
];

/**
 * The extra parameters the Connect button sends.
 *
 * `prompt: 'consent'` because this is the press that must return a refresh
 * token, including for an account that granted these scopes before the app
 * started asking for offline access. It happens once, so the toll is fair
 * here and would not be on every sign-in.
 */
export function calendarAuthParams(): Record<string, string> {
  return {
    prompt: 'consent',
    access_type: 'offline',
    scope: [...IDENTITY_SCOPES, ...CALENDAR_SCOPES].join(' '),
  };
}

/** Whether a granted scope string carries any calendar access at all. */
export function grantsCalendar(scope: string): boolean {
  return CALENDAR_SCOPES.some((s) => scope.includes(s));
}
