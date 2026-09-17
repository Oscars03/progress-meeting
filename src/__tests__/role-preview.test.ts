/**
 * The rules behind the role preview, tested on their own.
 *
 * These two functions are the entire security boundary of the feature: a
 * cookie decides what the app behaves as, so what must be true is that the
 * cookie can only ever lower it, and only for somebody who was already an
 * admin.
 */

import { describe, it, expect } from 'vitest';
import {
  PREVIEWABLE_VIEWS,
  effectiveRole,
  isPreviewableView,
  previewsLead,
} from '../lib/role-preview';
import type { Role } from '../lib/auth-guard';

const ALL_ROLES: Role[] = ['admin', 'professor', 'student'];

describe('effectiveRole', () => {
  it('lets an admin look through a lower role', () => {
    expect(effectiveRole('admin', 'student')).toBe('student');
    expect(effectiveRole('admin', 'professor')).toBe('professor');
  });

  // Leading a week is a duty, not a rank. The person holding it is an ordinary
  // student, so that is the role the view carries.
  it('reads the lead view as a student', () => {
    expect(effectiveRole('admin', 'lead')).toBe('student');
  });

  it('leaves an admin as themselves when nothing is set', () => {
    expect(effectiveRole('admin', undefined)).toBe('admin');
    expect(effectiveRole('admin', '')).toBe('admin');
  });

  // The property worth stating outright: no input raises anybody.
  it('never returns a role above the real one, for any input', () => {
    const rank: Record<Role, number> = { admin: 3, professor: 2, student: 1 };
    const inputs = [...ALL_ROLES, 'lead', undefined, '', 'superuser', 'ADMIN', ' admin '];

    for (const real of ALL_ROLES) {
      for (const value of inputs) {
        expect(rank[effectiveRole(real, value)]).toBeLessThanOrEqual(rank[real]);
      }
    }
  });

  it('does not consult the cookie at all below admin', () => {
    for (const value of ['admin', 'professor', 'student', 'lead', 'nonsense']) {
      expect(effectiveRole('student', value)).toBe('student');
      expect(effectiveRole('professor', value)).toBe('professor');
    }
  });

  it('ignores a value that is merely close to a view', () => {
    expect(effectiveRole('admin', 'Student')).toBe('admin');
    expect(effectiveRole('admin', 'student ')).toBe('admin');
    expect(effectiveRole('admin', 'Lead')).toBe('admin');
  });
});

describe('previewsLead', () => {
  it('is set only by the lead view', () => {
    expect(previewsLead('admin', 'lead')).toBe(true);
    expect(previewsLead('admin', 'student')).toBe(false);
    expect(previewsLead('admin', 'professor')).toBe(false);
    expect(previewsLead('admin', undefined)).toBe(false);
  });

  /**
   * The one that matters. Leading a week is real authority -- closing a poll,
   * confirming a time, tidying the board -- so a cookie must not be able to
   * hand it to somebody who is not already an admin.
   */
  it('is never set for anybody but an admin', () => {
    for (const real of ['professor', 'student'] as Role[]) {
      for (const value of ['lead', 'admin', 'student', 'nonsense', undefined]) {
        expect(previewsLead(real, value)).toBe(false);
      }
    }
  });
});

describe('isPreviewableView', () => {
  it('covers the views offered and nothing else', () => {
    expect([...PREVIEWABLE_VIEWS]).toEqual(['professor', 'student', 'lead']);
    expect(isPreviewableView('professor')).toBe(true);
    expect(isPreviewableView('student')).toBe(true);
    expect(isPreviewableView('lead')).toBe(true);
  });

  // Stopping is how an admin gets back, not selecting themselves.
  it('excludes admin on purpose', () => {
    expect(isPreviewableView('admin')).toBe(false);
  });

  it('rejects anything that is not one of them', () => {
    for (const value of [undefined, null, 1, {}, [], '', 'viewer']) {
      expect(isPreviewableView(value)).toBe(false);
    }
  });
});
