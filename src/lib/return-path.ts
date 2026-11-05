/**
 * Where to go after signing in.
 *
 * A link to a poll, sent to somebody who is signed out, used to land them on
 * the dashboard once they had signed in: the redirect to /login dropped the
 * page they asked for. The proxy now writes the requested path into a request
 * header, the sign-in redirect carries it as `callbackUrl`, and the login form
 * sends them back to it.
 *
 * Only a path on this site is ever accepted. A `callbackUrl` is something
 * anybody can put in a link, and `//evil.example` or `/\evil.example` are read
 * by a browser as another host.
 */

/** The request header the proxy puts the requested path in. */
export const RETURN_TO_HEADER = 'x-return-to';

export function safeReturnPath(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/')) return null;
  if (value.startsWith('//') || value.startsWith('/\\')) return null;
  // Back to the sign-in page is a loop, and an API route is not a page.
  if (value === '/login' || value.startsWith('/login?') || value.startsWith('/api/')) return null;
  return value;
}

/** `/login`, carrying the page to come back to when there is one worth it. */
export function loginHref(returnTo: string | null | undefined): string {
  const path = safeReturnPath(returnTo);
  // The dashboard is where signing in goes anyway; no need to spell it out.
  if (!path || path === '/' || path === '/dashboard') return '/login';
  return `/login?callbackUrl=${encodeURIComponent(path)}`;
}
