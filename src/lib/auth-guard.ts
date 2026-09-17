import { getServerSession } from 'next-auth';
import { cookies } from 'next/headers';
import { authOptions } from './auth';
import { UserError } from './user-error';
import { ROLE_PREVIEW_COOKIE, effectiveRole } from './role-preview';
import type { TranslationKey, TranslationVars } from './ui/i18n';

export type Role = 'admin' | 'professor' | 'student';

/**
 * Highest privilege first. A role satisfies any requirement at or below its rank.
 *
 * Three roles, because there are three kinds of people here: the person who
 * runs the system, the advisors, and the students who report to them. An
 * unrecognised role in the sheet falls to `student`, the floor -- see
 * requireSession.
 */
const RANK: Record<Role, number> = {
  admin: 3,
  professor: 2,
  student: 1,
};

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  /**
   * What the app should behave as. Normally the stored role; for an admin who
   * is previewing another one, that one -- see lib/role-preview.ts.
   */
  role: Role;
  /**
   * What they actually are. Everything that decides whether the preview itself
   * may be changed reads this, so an admin looking through a student's eyes can
   * always put them down again.
   */
  realRole: Role;
  /** Set only while `role` differs from `realRole`. */
  previewing: boolean;
};

export class AuthorizationError extends UserError {
  constructor(key: TranslationKey = 'error.forbidden', vars?: TranslationVars) {
    super(key, vars);
    this.name = 'AuthorizationError';
  }
}

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && value in RANK;
}

/**
 * The role an admin has asked to look through, if any.
 *
 * `cookies()` throws where there is no request to read one from, and this is
 * called from every action and route handler -- so a context without one must
 * mean "not previewing" rather than bringing the whole call down. Nothing is
 * granted by the answer, so failing to read it can only ever be safe.
 */
async function previewCookie(): Promise<string | undefined> {
  try {
    return (await cookies()).get(ROLE_PREVIEW_COOKIE)?.value;
  } catch {
    return undefined;
  }
}

/** Resolve the caller, or throw. Every server action and route handler starts here. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user?.id) {
    throw new AuthorizationError('error.signInRequired');
  }

  // An unrecognised role is treated as the least privileged, never as a pass.
  const realRole: Role = isRole(user.role) ? user.role : 'student';

  // Honoured for admins only, and never able to select admin, so it can lower
  // what somebody sees and never raise it. For everybody else the cookie is
  // not even read.
  const role = effectiveRole(realRole, await previewCookie());

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role,
    realRole,
    previewing: role !== realRole,
  };
}

/**
 * Resolve the caller and assert they are *really* an admin, ignoring any
 * preview.
 *
 * Only for the controls that govern the preview itself. Everything else must
 * go through requireRole, or previewing as a student would not actually stop
 * an admin doing admin things and the preview would be a lie.
 */
export async function requireRealAdmin(): Promise<SessionUser> {
  const user = await requireSession();

  if (user.realRole !== 'admin') {
    throw new AuthorizationError('error.roleRequired', { role: 'admin', current: user.realRole });
  }

  return user;
}

/**
 * Resolve the caller and assert they hold at least `minimum`.
 *
 * Server Actions are reachable by anyone holding the action id, so this must be
 * called inside the action itself -- being defined next to a guarded action, or
 * rendered behind a guarded page, protects nothing.
 */
export async function requireRole(minimum: Role): Promise<SessionUser> {
  const user = await requireSession();

  if (RANK[user.role] < RANK[minimum]) {
    throw new AuthorizationError('error.roleRequired', { role: minimum, current: user.role });
  }

  return user;
}

/**
 * Whether a role carries manager-level abilities -- ordering the agenda,
 * closing a poll, confirming the week's lead, removing other people's rows.
 *
 * Pages asked for the roles by name in four places, which silently excluded
 * any role added later. Ask this instead.
 */
export function hasManagerRights(role: Role): boolean {
  return RANK[role] >= RANK.professor;
}

// Takes the role rather than the whole caller: what somebody may mint depends
// on their rank and on nothing else about them.
export function canAssignRole(actor: Pick<SessionUser, 'role'>, target: Role): boolean {
  // Nobody may create an account more privileged than themselves.
  return RANK[actor.role] >= RANK[target];
}
