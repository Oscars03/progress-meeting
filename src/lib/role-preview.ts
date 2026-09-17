/**
 * Letting an admin look at the app as somebody less privileged.
 *
 * The app shows three quite different things to three roles, and until now the
 * only way to find out what a student actually sees was to ask a student. This
 * is a *view*, not a change: the stored role is untouched, so nothing about
 * what the person is allowed to do is decided here.
 *
 * Pure, and its own module, so the one rule that matters can be tested
 * directly rather than through a cookie and a session.
 */

import type { Role } from './auth-guard';

/**
 * Not httpOnly-sensitive in the usual way -- it grants nothing. It is set with
 * httpOnly anyway because nothing in the browser needs to read it, and a
 * preference the page cannot rewrite is one fewer thing to reason about.
 */
export const ROLE_PREVIEW_COOKIE = 'role-preview';

/** The roles an admin may look through. Admin itself means "stop previewing". */
export const PREVIEWABLE_ROLES: Role[] = ['professor', 'student'];

export function isPreviewableRole(value: unknown): value is Role {
  return typeof value === 'string' && (PREVIEWABLE_ROLES as string[]).includes(value);
}

/**
 * The role the app should behave as, given who somebody really is and what
 * they asked to preview.
 *
 * The whole security of this feature is the first line. A preview can only
 * ever *lower* what somebody sees, because it is honoured for admins alone:
 * for anybody else the cookie is not consulted at all, so setting it by hand
 * gains nothing. It cannot select `admin` either, so it is never an escalation
 * even for the admin who set it -- only a way back down to it.
 */
export function effectiveRole(realRole: Role, previewValue: string | undefined): Role {
  if (realRole !== 'admin') return realRole;
  return isPreviewableRole(previewValue) ? previewValue : realRole;
}
