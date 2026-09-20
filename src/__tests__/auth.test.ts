import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserRecord } from '../lib/db/schema';
import { hashPassword } from '../lib/password';
import { PENDING_APPROVAL, TEMPORARY_ERROR } from '../lib/auth-signals';

const findMock = vi.fn();
vi.mock('../lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: (...args: unknown[]) => findMock(...args),
    insert: vi.fn(),
  },
}));

const { authOptions } = await import('../lib/auth');

type AuthorizeFn = (
  credentials: Record<string, string> | undefined
) => Promise<{ id: string; role: string } | null>;

function credentialsAuthorize(): AuthorizeFn {
  const provider = authOptions.providers.find((p) => p.id === 'credentials');
  // next-auth v4 keeps the user-supplied implementation on `options`.
  const opts = (provider as unknown as { options: { authorize: AuthorizeFn } }).options;
  return opts.authorize;
}

function user(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'u1',
    created_at: '',
    updated_at: '',
    row_version: 1,
    created_by: 'system',
    name: 'Admin',
    email: 'admin@test.com',
    password_hash: '',
    role: 'admin',
    team_id: '',
    line_id: '',
    active: true,
    rotation_order: '',
    permissions: '',
    ...overrides,
  };
}

beforeEach(() => findMock.mockReset());

describe('credentials authorize', () => {
  it('accepts the real password', async () => {
    const password_hash = await hashPassword('correct-horse-battery');
    findMock.mockResolvedValue([user({ password_hash })]);

    const result = await credentialsAuthorize()({
      email: 'admin@test.com',
      password: 'correct-horse-battery',
    });

    expect(result).toMatchObject({ id: 'u1', role: 'admin' });
  });

  // Regression: the literal string "password" used to authenticate ANY active
  // user regardless of their stored password.
  it('rejects the literal string "password" when it is not the real password', async () => {
    const password_hash = await hashPassword('correct-horse-battery');
    findMock.mockResolvedValue([user({ password_hash })]);

    const result = await credentialsAuthorize()({
      email: 'admin@test.com',
      password: 'password',
    });

    expect(result).toBeNull();
  });

  it('rejects a legacy plaintext password_hash instead of comparing directly', async () => {
    findMock.mockResolvedValue([user({ password_hash: 'plaintext-secret' })]);

    const result = await credentialsAuthorize()({
      email: 'admin@test.com',
      password: 'plaintext-secret',
    });

    expect(result).toBeNull();
  });

  // Still refused -- but it says *why*, so the form can send the person to the
  // waiting screen instead of "sign-in failed", which sent them off to register
  // a second time. Safe to say out loud only because it comes after the
  // password check: a stranger cannot use it to discover who has an account.
  it('refuses an inactive account holding the correct password, as pending approval', async () => {
    const password_hash = await hashPassword('correct-horse-battery');
    findMock.mockResolvedValue([user({ password_hash, active: false })]);

    await expect(
      credentialsAuthorize()({ email: 'admin@test.com', password: 'correct-horse-battery' })
    ).rejects.toThrow(PENDING_APPROVAL);
  });

  it('gives an inactive account the same blank refusal as anyone else when the password is wrong', async () => {
    const password_hash = await hashPassword('correct-horse-battery');
    findMock.mockResolvedValue([user({ password_hash, active: false })]);

    const result = await credentialsAuthorize()({
      email: 'admin@test.com',
      password: 'not-the-password',
    });

    expect(result).toBeNull();
  });

  it('matches email case-insensitively and ignores surrounding whitespace', async () => {
    const password_hash = await hashPassword('correct-horse-battery');
    findMock.mockResolvedValue([user({ password_hash })]);

    const result = await credentialsAuthorize()({
      email: '  Admin@Test.com  ',
      password: 'correct-horse-battery',
    });

    expect(result).toMatchObject({ id: 'u1' });
  });

  it('rejects empty credentials', async () => {
    findMock.mockResolvedValue([user()]);
    expect(await credentialsAuthorize()({ email: '', password: '' })).toBeNull();
    expect(await credentialsAuthorize()(undefined)).toBeNull();
  });
});

describe('session configuration', () => {
  it('expires the session and JWT after 2 days, updating the session daily', () => {
    const twoDays = 60 * 60 * 24 * 2;
    const oneDay = 60 * 60 * 24;

    expect(authOptions.session?.maxAge).toBe(twoDays);
    expect(authOptions.session?.updateAge).toBe(oneDay);
    expect(authOptions.jwt?.maxAge).toBe(twoDays);
  });
});

describe('google sign-in', () => {
  type SignInFn = (params: {
    user: { id?: string; name?: string | null; email?: string | null; role?: string };
    account: { provider: string; scope?: string; refresh_token?: string } | null;
  }) => Promise<boolean | string>;

  const signInCallback = () => authOptions.callbacks!.signIn as unknown as SignInFn;

  const googleSignIn = (email: string, name = 'Somebody') =>
    signInCallback()({ user: { email, name }, account: { provider: 'google', scope: 'openid email profile' } });

  it('lets an approved account in, carrying its id and role from the sheet', async () => {
    findMock.mockResolvedValue([user({ id: 'u7', role: 'professor' })]);

    const params = {
      user: { email: 'admin@test.com', name: 'Admin' } as { email: string; name: string; id?: string; role?: string },
      account: { provider: 'google', scope: 'openid email profile' },
    };
    expect(await signInCallback()(params)).toBe(true);
    expect(params.user).toMatchObject({ id: 'u7', role: 'professor' });
  });

  it('sends an account still waiting for approval to the waiting screen', async () => {
    findMock.mockResolvedValue([user({ active: false })]);
    expect(await googleSignIn('admin@test.com')).toBe('/?pending=1');
  });

  // The sheet read is the one thing between choosing a Google account and being
  // let in, and there is no button to press again from inside the OAuth
  // callback -- a single hiccup used to cost the whole round trip to Google.
  it('retries a sheet read that failed once, and signs the person in', async () => {
    findMock
      .mockImplementationOnce(() => Promise.reject(new Error('Quota exceeded')))
      .mockResolvedValueOnce([user()]);

    expect(await googleSignIn('admin@test.com')).toBe(true);
    expect(findMock).toHaveBeenCalledTimes(2);
  });

  // `false` would be NextAuth's AccessDenied: a bare page of its own saying the
  // person may not come in. About a spreadsheet that was busy that is both
  // wrong and unactionable.
  it('returns a retryable error, not a refusal, when the sheet keeps failing', async () => {
    const busy = () => Promise.reject(new Error('Quota exceeded'));
    findMock.mockImplementationOnce(busy).mockImplementationOnce(busy);

    expect(await googleSignIn('admin@test.com')).toBe(`/login?error=${TEMPORARY_ERROR}`);
    expect(findMock).toHaveBeenCalledTimes(2);
  });

  it('turns away an address whose domain may not self-register', async () => {
    findMock.mockResolvedValue([]);
    expect(await googleSignIn('stranger@elsewhere.com')).toBe('/login?error=AccessDenied');
  });

  it('leaves a non-google provider alone', async () => {
    expect(await signInCallback()({ user: { email: 'admin@test.com' }, account: { provider: 'credentials' } })).toBe(true);
    expect(findMock).not.toHaveBeenCalled();
  });
});

describe('sign-in pages', () => {
  // Without an error page of its own, AccessDenied and Configuration land on
  // NextAuth's built-in page: English, unstyled, and no way back to the form.
  it("shows every failure on this app's own login form", () => {
    expect(authOptions.pages?.signIn).toBe('/login');
    expect(authOptions.pages?.error).toBe('/login');
  });
});
