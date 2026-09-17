/**
 * The one rule behind the role preview, tested on its own.
 *
 * `effectiveRole` is the entire security boundary of the feature: a cookie
 * decides what the app behaves as, so what must be true is that the cookie can
 * only ever lower it, and only for somebody who was already an admin.
 */

import { describe, it, expect } from 'vitest';
import {
  PREVIEWABLE_ROLES,
  effectiveRole,
  isPreviewableRole,
} from '../lib/role-preview';
import type { Role } from '../lib/auth-guard';

const ALL_ROLES: Role[] = ['admin', 'professor', 'student'];

describe('effectiveRole', () => {
  it('lets an admin look through a lower role', () => {
    expect(effectiveRole('admin', 'student')).toBe('student');
    expect(effectiveRole('admin', 'professor')).toBe('professor');
  });

  it('leaves an admin as themselves when nothing is set', () => {
    expect(effectiveRole('admin', undefined)).toBe('admin');
    expect(effectiveRole('admin', '')).toBe('admin');
  });

  // The property worth stating outright: no input raises anybody.
  it('never returns a role above the real one, for any input', () => {
    const rank: Record<Role, number> = { admin: 3, professor: 2, student: 1 };
    const inputs = [...ALL_ROLES, undefined, '', 'superuser', 'ADMIN', 'Admin', ' admin '];

    for (const real of ALL_ROLES) {
      for (const value of inputs) {
        expect(rank[effectiveRole(real, value)]).toBeLessThanOrEqual(rank[real]);
      }
    }
  });

  it('does not consult the cookie at all below admin', () => {
    for (const value of ['admin', 'professor', 'student', 'nonsense']) {
      expect(effectiveRole('student', value)).toBe('student');
      expect(effectiveRole('professor', value)).toBe('professor');
    }
  });

  it('ignores a value that is merely close to a role', () => {
    expect(effectiveRole('admin', 'Student')).toBe('admin');
    expect(effectiveRole('admin', 'student ')).toBe('admin');
    expect(effectiveRole('admin', 'stud')).toBe('admin');
  });
});

describe('isPreviewableRole', () => {
  it('covers the roles offered and nothing else', () => {
    expect(PREVIEWABLE_ROLES).toEqual(['professor', 'student']);
    expect(isPreviewableRole('professor')).toBe(true);
    expect(isPreviewableRole('student')).toBe(true);
  });

  // Stopping is how an admin gets back, not selecting themselves.
  it('excludes admin on purpose', () => {
    expect(isPreviewableRole('admin')).toBe(false);
  });

  it('rejects anything that is not a string role', () => {
    for (const value of [undefined, null, 1, {}, [], '']) {
      expect(isPreviewableRole(value)).toBe(false);
    }
  });
});
