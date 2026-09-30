import { NextResponse } from 'next/server';
import {
  askLabWhoami,
  clientIp,
  createRateLimiter,
  isLabAdmin,
  isLabOrigin,
} from '@/lib/lab-sso';
import { resolveLabAccount, sessionCookieFor } from '@/lib/lab-sso-account';
import { LAB_SSO_DENIED, LAB_SSO_UNAVAILABLE, TEMPORARY_ERROR } from '@/lib/auth-signals';

/**
 * The lab website's "Progress board" button lands here: a real form POST
 * (a page navigation, not fetch) carrying a Firebase ID token. See
 * lib/lab-sso.ts for what is checked and why.
 *
 * Every answer but the first two is a 303 to a page, because the browser is
 * navigating and a JSON body would be what the person sees.
 */

const allow = createRateLimiter(30, 60_000);

export async function POST(req: Request) {
  if (!isLabOrigin(req.headers.get('origin'))) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  if (!allow(clientIp(req.headers))) {
    return new NextResponse('Too many requests', { status: 429 });
  }

  const to = (path: string) => NextResponse.redirect(new URL(path, req.url), 303);

  let token = '';
  try {
    const value = (await req.formData()).get('token');
    token = typeof value === 'string' ? value : '';
  } catch {
    // Not a form body at all; treated as a missing token.
  }
  // The form's `name` field is deliberately never read: it comes from the
  // browser and anyone can type anything into it.
  if (!token) return to(`/login?error=${LAB_SSO_DENIED}`);

  const who = await askLabWhoami(token);
  if (who.kind === 'unavailable') return to(`/login?error=${LAB_SSO_UNAVAILABLE}`);
  if (who.kind === 'rejected' || !isLabAdmin(who.user)) {
    return to(`/login?error=${LAB_SSO_DENIED}`);
  }

  const account = await resolveLabAccount(who.user);
  if (account.kind === 'temporary') return to(`/login?error=${TEMPORARY_ERROR}`);
  if (account.kind === 'pending') return to('/login?pending=1');

  const cookie = await sessionCookieFor(account.user);
  const res = to('/dashboard');
  res.cookies.set(cookie.name, cookie.value, cookie.options);
  return res;
}
