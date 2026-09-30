/**
 * Single sign-on from the lab website, irish-tech.com.
 *
 * The lab site posts a Firebase ID token to /auth/firebase. This app never
 * verifies that token itself: it hands it to the lab's own whoami endpoint,
 * which checks signature, audience and expiry and answers with the account
 * behind it. Whoever that is must be a lab *admin* -- the button is shown to
 * admins only, but the endpoint is public, so the check lives here.
 *
 * The token is a bearer credential for the lab's API until it expires. It is
 * used for that one request and then dropped: never stored, never logged.
 */

export const LAB_ORIGINS = [
  'https://irish-tech.com',
  'https://www.irish-tech.com',
  // The lab team's dev server, for their end-to-end test. Temporary: remove
  // when they say testing is done.
  'http://localhost:3000',
];

const WHOAMI_URL = 'https://irish-tech.com/api/users/me';
const WHOAMI_TIMEOUT_MS = 6000;

/**
 * Login CSRF guard. Without it any page could post somebody else's token and
 * sign the visitor in as that person.
 */
export function isLabOrigin(origin: string | null): boolean {
  return origin !== null && LAB_ORIGINS.includes(origin);
}

/** The three fields this app uses. The lab's user object carries far more. */
export type LabUser = { role: string; displayName: string; email: string };

export type WhoamiResult =
  | { kind: 'user'; user: LabUser }
  /** The token is bad or expired, or its owner has never used the lab site. */
  | { kind: 'rejected' }
  /** The lab site did not answer usefully. Pressing the button again may work. */
  | { kind: 'unavailable' };

export async function askLabWhoami(
  token: string,
  fetchImpl: typeof fetch = fetch
): Promise<WhoamiResult> {
  let res: Response;
  try {
    res = await fetchImpl(WHOAMI_URL, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(WHOAMI_TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch {
    return { kind: 'unavailable' };
  }

  if (res.status === 401 || res.status === 403) return { kind: 'rejected' };
  if (res.status !== 200) return { kind: 'unavailable' };

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: 'unavailable' };
  }

  // Pick the three fields out here and let the rest of the object -- phone,
  // birthday, address -- go out of scope unread.
  const raw = (body as { user?: unknown } | null)?.user;
  if (!raw || typeof raw !== 'object') return { kind: 'rejected' };
  const { role, display_name, email } = raw as Record<string, unknown>;
  if (typeof email !== 'string' || !email.trim()) return { kind: 'rejected' };

  return {
    kind: 'user',
    user: {
      role: typeof role === 'string' ? role : '',
      displayName: typeof display_name === 'string' ? display_name.trim() : '',
      email,
    },
  };
}

export function isLabAdmin(user: LabUser): boolean {
  return user.role === 'admin';
}

/**
 * A per-instance limit on attempts from one address.
 *
 * Best effort: each server instance keeps its own count, so across a scaled
 * deployment the true ceiling is this times the number of instances. It is
 * there to stop one client hammering the lab's whoami through us, not to be a
 * guarantee -- that would take a firewall rule.
 */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function allow(key: string, now: number = Date.now()): boolean {
    // Sweep stale entries now and then so the map cannot grow without bound.
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    entry.count += 1;
    return entry.count <= limit;
  };
}

/** The address a request came from, as Vercel reports it. */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') ?? 'unknown';
}
