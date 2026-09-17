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

/**
 * Leading a week is not a role -- it is a duty that rotates, recorded per week
 * in `week_leads` and held by an ordinary student. But it is the viewpoint that
 * differs most from everyone else's, so it is the one most worth being able to
 * look at, and "which role am I previewing" is the wrong question for it.
 *
 * Previewing it means: a student, who happens to hold the current week.
 */
export const LEAD_VIEW = 'lead';

/**
 * What an admin may look through. Admin itself is absent on purpose: stopping
 * is how you get back to it, which is what makes this incapable of raising
 * anybody.
 */
export const PREVIEWABLE_VIEWS = ['professor', 'student', LEAD_VIEW] as const;

export type PreviewView = (typeof PREVIEWABLE_VIEWS)[number];

export function isPreviewableView(value: unknown): value is PreviewView {
  return typeof value === 'string' && (PREVIEWABLE_VIEWS as readonly string[]).includes(value);
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
  if (!isPreviewableView(previewValue)) return realRole;
  // The lead is a student who holds the week, so that is the role it carries.
  // What makes the view different is the duty, not the rank.
  return previewValue === LEAD_VIEW ? 'student' : previewValue;
}

/**
 * Whether this preview means "and I hold the current week".
 *
 * Same guard as `effectiveRole`, for the same reason: honoured for an admin
 * alone, so a cookie set by anybody else carries no duty either. It grants
 * nothing an admin did not already have -- leading a week is a subset of what
 * admin can do -- which is what makes it safe to let the actions honour it
 * rather than only the pages.
 */
export function previewsLead(realRole: Role, previewValue: string | undefined): boolean {
  return realRole === 'admin' && previewValue === LEAD_VIEW;
}
