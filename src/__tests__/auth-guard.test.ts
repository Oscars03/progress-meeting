import { describe, it, expect, vi, beforeEach } from 'vitest';

const getServerSessionMock = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: () => getServerSessionMock() }));
vi.mock('../lib/auth', () => ({ authOptions: {} }));

const { requireSession, requireRole, canAssignRole, hasManagerRights, AuthorizationError } =
  await import('../lib/auth-guard');

beforeEach(() => getServerSessionMock.mockReset());

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

describe('canAssignRole', () => {
  it('stops anyone minting an account above their own rank', () => {
    const professor = { id: 'u1', role: 'professor' as const };
    expect(canAssignRole(professor, 'admin')).toBe(false);
    expect(canAssignRole(professor, 'student')).toBe(true);
    expect(canAssignRole({ id: 'u2', role: 'admin' }, 'admin')).toBe(true);
  });
});

describe('hasManagerRights', () => {
  it('covers professors and admins but not students', () => {
    expect(hasManagerRights('admin')).toBe(true);
    expect(hasManagerRights('professor')).toBe(true);
    expect(hasManagerRights('student')).toBe(false);
  });
});
