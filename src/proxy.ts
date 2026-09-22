import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Send every production request to the one address sign-in works from.
 *
 * The deployment answers to more than one hostname -- the old project alias
 * `progress-meeting-chi.vercel.app` still points at it. Google sign-in cannot
 * survive that: NextAuth sets its state cookie on whichever host the button
 * was pressed on, but Google always returns to NEXTAUTH_URL's callback, where
 * that cookie does not exist. The result is "State cookie was missing" and an
 * OAuthCallback error on the login form, every time, from that address.
 *
 * Moving the person to the canonical host before they ever reach the form
 * means the cookie and the callback always live on the same origin.
 *
 * Production only: preview deployments and localhost have their own URLs and
 * are meant to be used as they are.
 */
export function proxy(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'production') return NextResponse.next();

  const canonical = canonicalHost();
  const host = request.headers.get('host');
  if (!canonical || !host || host === canonical) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.protocol = 'https:';
  url.host = canonical;
  url.port = '';
  // 308 keeps the method and body, so a stray POST arrives intact.
  return NextResponse.redirect(url, 308);
}

function canonicalHost(): string | null {
  try {
    return process.env.NEXTAUTH_URL ? new URL(process.env.NEXTAUTH_URL).host : null;
  } catch {
    return null;
  }
}

export const config = {
  // Static assets need no redirect, and the cron endpoint is called by
  // Vercel on the deployment's own URL -- a redirect there would skip a run.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|api/cron).*)'],
};
