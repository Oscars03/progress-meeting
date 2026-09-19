import { describe, it, expect, vi, beforeEach } from 'vitest';

const getServerSessionMock = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: () => getServerSessionMock() }));
vi.mock('../lib/auth', () => ({ authOptions: {} }));

// The role preview travels in a cookie, so requireSession reads one.
let cookieValue: string | undefined;
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => (cookieValue === undefined ? undefined : { value: cookieValue }),
  }),
}));

const {
  requireSession,
  requireRole,
  requireRealAdmin,
  canAssignRole,
  directsWork,
  AuthorizationError,
} = await import('../lib/auth-guard');

beforeEach(() => {
  getServerSessionMock.mockReset();
  cookieValue = undefined;
});

function session(role: string, id = 'u1') {
  return { user: { id, name: 'X', email: 'x@test.com', role } };
}

describe('requireSession', () => {
  it('rejects an anonymous caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow(AuthorizationError);
  });

  it('rejects a session with no user id', async () => {
    getServerSessionMock.mockResolvedValue({ user: { role: 'admin' } });
    await expect(requireSession()).rejects.toThrow(AuthorizationError);
  });

  it('downgrades an unrecognised role to student, the floor, rather than trusting it', async () => {
    getServerSessionMock.mockResolvedValue(session('superuser'));
    await expect(requireSession()).resolves.toMatchObject({ role: 'student' });
  });
});

describe('requireRole', () => {
  it('lets a higher rank satisfy a lower requirement', async () => {
    getServerSessionMock.mockResolvedValue(session('admin'));
    await expect(requireRole('student')).resolves.toMatchObject({ role: 'admin' });
  });

  // Regression: every server action used to check only that a session existed,
  // so any member could manage users and mint admins.
  it('blocks a student from an admin-only action', async () => {
    getServerSessionMock.mockResolvedValue(session('student'));
    await expect(requireRole('admin')).rejects.toThrow(AuthorizationError);
  });

  it('blocks a student from a professor-only action', async () => {
    getServerSessionMock.mockResolvedValue(session('student'));
    await expect(requireRole('professor')).rejects.toThrow(AuthorizationError);
  });

  it('does not let an unrecognised role reach a professor-only action', async () => {
    getServerSessionMock.mockResolvedValue(session('superuser'));
    await expect(requireRole('professor')).rejects.toThrow(AuthorizationError);
  });

  it('lets a professor satisfy a professor-only action', async () => {
    getServerSessionMock.mockResolvedValue(session('professor'));
    await expect(requireRole('professor')).resolves.toMatchObject({ role: 'professor' });
  });
});

/**
 * An admin looking at the app as somebody else.
 *
 * The property that matters is that this can only ever *lower* what somebody
 * sees. It is a view, so a cookie is the whole of it -- which is exactly why
 * it has to be impossible for anyone but an admin to gain anything by setting
 * one by hand.
 */
describe('previewing another role', () => {
  it('shows an admin the app as a student when they ask', async () => {
    getServerSessionMock.mockResolvedValue(session('admin'));
    cookieValue = 'student';

    await expect(requireSession()).resolves.toMatchObject({
      role: 'student',
      realRole: 'admin',
      previewing: true,
    });
  });

  it('actually refuses the admin things while previewing, or it would be a lie', async () => {
    getServerSessionMock.mockResolvedValue(session('admin'));
    cookieValue = 'student';

    await expect(requireRole('admin')).rejects.toThrow(AuthorizationError);
  });

  it('ignores the cookie for a student, so setting one by hand gains nothing', async () => {
    getServerSessionMock.mockResolvedValue(session('student'));
    cookieValue = 'admin';

    await expect(requireSession()).resolves.toMatchObject({
      role: 'student',
      realRole: 'student',
      previewing: false,
    });
  });

  it('ignores it for a professor too, in either direction', async () => {
    getServerSessionMock.mockResolvedValue(session('professor'));
    cookieValue = 'admin';
    await expect(requireSession()).resolves.toMatchObject({ role: 'professor' });

    cookieValue = 'student';
    await expect(requireSession()).resolves.toMatchObject({ role: 'professor' });
  });

  it('cannot select admin, so it is never a way up', async () => {
    getServerSessionMock.mockResolvedValue(session('admin'));
    cookieValue = 'admin';

    // Not previewable, so it falls through to the real role -- which happens
    // to be admin here, but arrives that way rather than being granted.
    await expect(requireSession()).resolves.toMatchObject({
      role: 'admin',
      previewing: false,
    });
  });

  it('ignores a value that is not a role at all', async () => {
    getServerSessionMock.mockResolvedValue(session('admin'));
    cookieValue = 'superuser';

    await expect(requireSession()).resolves.toMatchObject({
      role: 'admin',
      previewing: false,
    });
  });

  it('lets a previewing admin still prove they are one, so they can stop', async () => {
    getServerSessionMock.mockResolvedValue(session('admin'));
    cookieValue = 'student';

    // requireRole('admin') refuses above. This is the door out.
    await expect(requireRealAdmin()).resolves.toMatchObject({ realRole: 'admin' });
  });

  it('does not let a student through that door', async () => {
    getServerSessionMock.mockResolvedValue(session('student'));
    await expect(requireRealAdmin()).rejects.toThrow(AuthorizationError);
  });
});

describe('canAssignRole', () => {
  it('stops anyone minting an account above their own rank', () => {
    const professor = { id: 'u1', role: 'professor' as const };
    expect(canAssignRole(professor, 'admin')).toBe(false);
    expect(canAssignRole(professor, 'student')).toBe(true);
    expect(canAssignRole({ role: 'admin' }, 'admin')).toBe(true);
  });
});

describe('directsWork', () => {
  it('covers professors and admins but not students', () => {
    expect(directsWork('admin')).toBe(true);
    expect(directsWork('professor')).toBe(true);
    expect(directsWork('student')).toBe(false);
  });
});
