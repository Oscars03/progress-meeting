import { encode } from 'next-auth/jwt';
import { authOptions, findUserByEmail } from './auth';
import { SheetRepo } from './db/sheet-repo';
import { normalizeEmail } from './signup-policy';
import type { UserRecord } from './db/schema';
import type { LabUser } from './lab-sso';

export type LabAccountOutcome =
  | { kind: 'signed-in'; user: UserRecord }
  /** Created just now, or already there and not (or no longer) let in. */
  | { kind: 'pending' }
  /** The spreadsheet could not be read or written. */
  | { kind: 'temporary' };

/**
 * Which Progress board account a lab admin arrives as.
 *
 * Matched on email, lowercased. The lab only vouches for who the person is;
 * whether they may come in is still this app's call, made the same way as for
 * Google: an account that exists but is not active stays shut, whichever door
 * it is tried from, and a new one is created inactive for an admin to approve.
 * An existing account keeps its own name -- display_name names new rows only,
 * because the name here is the one the rotation and meeting history show.
 */
export async function resolveLabAccount(labUser: LabUser): Promise<LabAccountOutcome> {
  const email = normalizeEmail(labUser.email);

  try {
    const existing = await findUserByEmail(email);
    if (existing) {
      return existing.active === true ? { kind: 'signed-in', user: existing } : { kind: 'pending' };
    }

    await SheetRepo.insert(
      'users',
      {
        name: labUser.displayName || email,
        email,
        password_hash: '',
        role: 'student',
        team_id: '',
        line_id: '',
        active: false,
      },
      'lab-sso',
      // keep, never update -- see the same call in login/actions.ts.
      { uniqueBy: { email }, onConflict: 'keep' }
    );
    return { kind: 'pending' };
  } catch (e) {
    console.error('Lab SSO account lookup failed:', e);
    return { kind: 'temporary' };
  }
}

const SESSION_MAX_AGE = authOptions.session?.maxAge ?? 60 * 60 * 24 * 2;

/**
 * The session cookie NextAuth itself would set for this user.
 *
 * Same name, same flags, same encrypted payload as the jwt callback in
 * auth.ts produces -- so getServerSession cannot tell this sign-in from any
 * other, and signing out clears it the usual way.
 */
export async function sessionCookieFor(user: UserRecord) {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is not set');

  // NextAuth's own rule for when cookies are Secure and __Secure- prefixed.
  const secure = process.env.NEXTAUTH_URL?.startsWith('https://') ?? Boolean(process.env.VERCEL);

  const value = await encode({
    token: {
      name: user.name,
      email: user.email,
      picture: null,
      sub: user.id,
      id: user.id,
      role: user.role,
    },
    secret,
    maxAge: SESSION_MAX_AGE,
  });

  return {
    name: `${secure ? '__Secure-' : ''}next-auth.session-token`,
    value,
    options: {
      httpOnly: true,
      sameSite: 'lax' as const,
      path: '/',
      secure,
      maxAge: SESSION_MAX_AGE,
    },
  };
}
