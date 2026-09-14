/**
 * Signals the sign-in flow passes from the server to the browser.
 *
 * Its own module because `auth.ts` reaches the spreadsheet and Google, and the
 * login form is a client component: importing the constant from there would
 * drag all of that into the browser bundle.
 */

/**
 * The credentials provider throws this when the password was right but the
 * account has not been approved. NextAuth surfaces an `authorize` throw as the
 * error string on the sign-in result, so the form matches on it and sends the
 * person to the waiting screen instead of showing "sign-in failed".
 */
export const PENDING_APPROVAL = 'PendingApproval';

/** Whether a NextAuth sign-in error means "approved yet?" rather than "wrong". */
export function isPendingApproval(error: string | null | undefined): boolean {
  return Boolean(error && error.includes(PENDING_APPROVAL));
}
