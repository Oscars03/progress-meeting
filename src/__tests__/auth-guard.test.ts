import { describe, it, expect, vi, beforeEach } from 'vitest';

const getServerSessionMock = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: () => getServerSessionMock() }));
vi.mock('../lib/auth', () => ({ authOptions: {} }));

const { requireSession, requireRole, canAssignRole, AuthorizationError } = await import(
  '../lib/auth-guard'
);

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

  it('downgrades an unrecognised role to viewer rather than trusting it', async () => {
    getServerSessionMock.mockResolvedValue(session('superuser'));
    await expect(requireSession()).resolves.toMatchObject({ role: 'viewer' });
  });
});

describe('requireRole', () => {
  it('lets a higher rank satisfy a lower requirement', async () => {
    getServerSessionMock.mockResolvedValue(session('admin'));
    await expect(requireRole('member')).resolves.toMatchObject({ role: 'admin' });
  });

  // Regression: every server action used to check only that a session existed,
  // so any member could manage users and mint admins.
  it('blocks a member from an admin-only action', async () => {
    getServerSessionMock.mockResolvedValue(session('member'));
    await expect(requireRole('admin')).rejects.toThrow(AuthorizationError);
  });

  it('blocks a viewer from a member-only action', async () => {
    getServerSessionMock.mockResolvedValue(session('viewer'));
    await expect(requireRole('member')).rejects.toThrow(AuthorizationError);
  });
});

describe('canAssignRole', () => {
  it('stops anyone minting an account above their own rank', () => {
    const manager = { id: 'u1', role: 'manager' as const };
    expect(canAssignRole(manager, 'admin')).toBe(false);
    expect(canAssignRole(manager, 'member')).toBe(true);
    expect(canAssignRole({ id: 'u2', role: 'admin' }, 'admin')).toBe(true);
  });
});
