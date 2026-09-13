import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { UserError } from './user-error';
import type { TranslationKey, TranslationVars } from './ui/i18n';

export type Role = 'admin' | 'manager' | 'member' | 'viewer';

/** Highest privilege first. A role satisfies any requirement at or below its rank. */
const RANK: Record<Role, number> = {
  admin: 4,
  manager: 3,
  member: 2,
  viewer: 1,
};

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
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

/** Resolve the caller, or throw. Every server action and route handler starts here. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  const user = session?.user;

  if (!user?.id) {
    throw new AuthorizationError('error.signInRequired');
  }

  // An unrecognised role is treated as the least privileged, never as a pass.
  const role: Role = isRole(user.role) ? user.role : 'viewer';

  return { id: user.id, name: user.name, email: user.email, role };
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

export function canAssignRole(actor: SessionUser, target: Role): boolean {
  // Nobody may create an account more privileged than themselves.
  return RANK[actor.role] >= RANK[target];
}
