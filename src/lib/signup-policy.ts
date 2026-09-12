/**
 * One definition of who may create their own account.
 *
 * Both sign-up paths -- Google and email/password -- read this. Two copies of
 * the rule is how one of them quietly drifts into accepting the world.
 */

export function normalizeEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/**
 * Domains permitted to self-register, comma separated.
 * Empty (the default) closes self-registration entirely: only accounts an
 * admin has already provisioned in the `users` sheet can sign in.
 */
export function allowedSignupDomains(): string[] {
  return (process.env.ALLOWED_SIGNUP_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isSignupAllowed(email: string): boolean {
  const domains = allowedSignupDomains();
  if (domains.length === 0) return false;
  const domain = normalizeEmail(email).split('@')[1] ?? '';
  return domain !== '' && domains.includes(domain);
}

/** Shape check only -- proving an address exists is the approval step's job. */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
