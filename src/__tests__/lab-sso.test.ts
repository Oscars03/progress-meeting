import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decode } from 'next-auth/jwt';
import type { UserRecord } from '../lib/db/schema';
import {
  askLabWhoami,
  clientIp,
  createRateLimiter,
  isLabAdmin,
  isLabOrigin,
} from '../lib/lab-sso';

const findMock = vi.fn();
const insertMock = vi.fn();
vi.mock('../lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: (...args: unknown[]) => findMock(...args),
    insert: (...args: unknown[]) => insertMock(...args),
  },
}));

const { resolveLabAccount, sessionCookieFor } = await import('../lib/lab-sso-account');
const { POST } = await import('../app/auth/firebase/route');

function user(overrides: Partial<UserRecord> = {}): UserRecord {
  return {
    id: 'u1',
    created_at: '',
    updated_at: '',
    row_version: 1,
    created_by: 'system',
    name: 'Somchai (board)',
    email: 'somchai@gmail.com',
    password_hash: '',
    role: 'professor',
    team_id: '',
    line_id: '',
    active: true,
    rotation_order: '',
    permissions: '',
    ...overrides,
  };
}

function reply(status: number, body?: unknown): typeof fetch {
  return (async () =>
    new Response(body === undefined ? null : JSON.stringify(body), { status })) as typeof fetch;
}

const LAB_USER = {
  role: 'admin',
  display_name: 'Somchai (lab)',
  email: 'Somchai@Gmail.com',
  phone: '0812345678',
  birthday: '1990-01-01',
};

beforeEach(() => {
  findMock.mockReset();
  insertMock.mockReset();
  vi.unstubAllGlobals();
  process.env.NEXTAUTH_SECRET = 'test-secret';
  process.env.NEXTAUTH_URL = 'http://localhost:3000';
});

describe('isLabOrigin', () => {
  it('accepts the lab site and rejects everything else', () => {
    expect(isLabOrigin('https://irish-tech.com')).toBe(true);
    expect(isLabOrigin('https://www.irish-tech.com')).toBe(true);
    expect(isLabOrigin(null)).toBe(false);
    expect(isLabOrigin('https://irish-tech.com.evil.example')).toBe(false);
    expect(isLabOrigin('http://irish-tech.com')).toBe(false);
    // The lab team's dev server, allowed only while they tested.
    expect(isLabOrigin('http://localhost:3000')).toBe(false);
  });
});

describe('askLabWhoami', () => {
  it('keeps only role, display name and email', async () => {
    const result = await askLabWhoami('t', reply(200, { ok: true, user: LAB_USER }));
    expect(result).toEqual({
      kind: 'user',
      user: { role: 'admin', displayName: 'Somchai (lab)', email: 'Somchai@Gmail.com' },
    });
  });

  it('sends the token as a bearer and does not follow redirects', async () => {
    const spy = vi.fn(reply(200, { ok: true, user: LAB_USER }));
    await askLabWhoami('the-token', spy);
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://irish-tech.com/api/users/me');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer the-token');
    expect(init.redirect).toBe('manual');
  });

  it('rejects a user who never signed in to the lab site', async () => {
    expect(await askLabWhoami('t', reply(200, { ok: true, user: null }))).toEqual({
      kind: 'rejected',
    });
  });

  it('rejects an invalid or expired token', async () => {
    expect(await askLabWhoami('t', reply(401, { ok: false }))).toEqual({ kind: 'rejected' });
  });

  it('calls a 5xx, a redirect, a bad body or a network failure unavailable', async () => {
    expect(await askLabWhoami('t', reply(502))).toEqual({ kind: 'unavailable' });
    expect(await askLabWhoami('t', reply(302))).toEqual({ kind: 'unavailable' });
    const notJson = (async () => new Response('<html>', { status: 200 })) as typeof fetch;
    expect(await askLabWhoami('t', notJson)).toEqual({ kind: 'unavailable' });
    const down = (async () => {
      throw new TypeError('fetch failed');
    }) as typeof fetch;
    expect(await askLabWhoami('t', down)).toEqual({ kind: 'unavailable' });
  });
});

describe('isLabAdmin', () => {
  it('is exact', () => {
    expect(isLabAdmin({ role: 'admin', displayName: '', email: 'a@b.c' })).toBe(true);
    expect(isLabAdmin({ role: 'Admin', displayName: '', email: 'a@b.c' })).toBe(false);
    expect(isLabAdmin({ role: 'member', displayName: '', email: 'a@b.c' })).toBe(false);
  });
});

describe('createRateLimiter', () => {
  it('allows the limit per window, per key', () => {
    const allow = createRateLimiter(2, 1000);
    expect(allow('a', 0)).toBe(true);
    expect(allow('a', 1)).toBe(true);
    expect(allow('a', 2)).toBe(false);
    expect(allow('b', 2)).toBe(true);
    expect(allow('a', 1000)).toBe(true);
  });
});

describe('clientIp', () => {
  it('takes the first forwarded address', () => {
    expect(clientIp(new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1' }))).toBe('1.2.3.4');
    expect(clientIp(new Headers())).toBe('unknown');
  });
});

describe('resolveLabAccount', () => {
  const labUser = { role: 'admin', displayName: 'Somchai (lab)', email: 'Somchai@Gmail.com' };

  it('signs in the matching active account, whatever the case of the email', async () => {
    findMock.mockResolvedValue([user()]);
    const outcome = await resolveLabAccount(labUser);
    expect(outcome).toEqual({ kind: 'signed-in', user: user() });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('leaves an inactive account shut', async () => {
    findMock.mockResolvedValue([user({ active: false })]);
    expect(await resolveLabAccount(labUser)).toEqual({ kind: 'pending' });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('creates an unknown admin as an inactive student named from the lab', async () => {
    findMock.mockResolvedValue([]);
    expect(await resolveLabAccount(labUser)).toEqual({ kind: 'pending' });
    expect(insertMock).toHaveBeenCalledTimes(1);
    const [table, row, actor, opts] = insertMock.mock.calls[0];
    expect(table).toBe('users');
    expect(row).toMatchObject({
      name: 'Somchai (lab)',
      email: 'somchai@gmail.com',
      role: 'student',
      active: false,
      password_hash: '',
    });
    expect(actor).toBe('lab-sso');
    expect(opts).toEqual({ uniqueBy: { email: 'somchai@gmail.com' }, onConflict: 'keep' });
  });

  it('reports a sheet failure as temporary', async () => {
    findMock.mockRejectedValue(new Error('quota'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await resolveLabAccount(labUser)).toEqual({ kind: 'temporary' });
  });
});

describe('sessionCookieFor', () => {
  it('produces a token NextAuth decodes to the same id and role', async () => {
    const cookie = await sessionCookieFor(user());
    expect(cookie.name).toBe('next-auth.session-token');
    expect(cookie.options).toMatchObject({ httpOnly: true, sameSite: 'lax', path: '/' });
    const payload = await decode({ token: cookie.value, secret: 'test-secret' });
    expect(payload).toMatchObject({ sub: 'u1', id: 'u1', role: 'professor', email: 'somchai@gmail.com' });
  });

  it('uses the __Secure- name on https', async () => {
    process.env.NEXTAUTH_URL = 'https://irish-progress.vercel.app';
    const cookie = await sessionCookieFor(user());
    expect(cookie.name).toBe('__Secure-next-auth.session-token');
    expect(cookie.options.secure).toBe(true);
  });
});

describe('POST /auth/firebase', () => {
  function post(origin: string | null, body: Record<string, string>, ip = '9.9.9.9') {
    const headers: Record<string, string> = {
      'content-type': 'application/x-www-form-urlencoded',
      'x-forwarded-for': ip,
    };
    if (origin) headers.origin = origin;
    return POST(
      new Request('http://localhost:3000/auth/firebase', {
        method: 'POST',
        headers,
        body: new URLSearchParams(body).toString(),
      })
    );
  }

  it('refuses a request from anywhere but the lab site', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect((await post(null, { token: 'x' })).status).toBe(403);
    expect((await post('https://evil.example', { token: 'x' })).status).toBe(403);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends a missing token back to login without asking the lab', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const res = await post('https://irish-tech.com', {}, '1.1.1.1');
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/login?error=LabSsoDenied');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a lab user who is not an admin, and sets no session', async () => {
    vi.stubGlobal('fetch', reply(200, { ok: true, user: { ...LAB_USER, role: 'member' } }));
    const res = await post('https://irish-tech.com', { token: 't' }, '2.2.2.2');
    expect(res.headers.get('location')).toContain('/login?error=LabSsoDenied');
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(findMock).not.toHaveBeenCalled();
  });

  it('says the lab is unavailable when it does not answer', async () => {
    vi.stubGlobal('fetch', reply(503));
    const res = await post('https://irish-tech.com', { token: 't' }, '3.3.3.3');
    expect(res.headers.get('location')).toContain('/login?error=LabSsoUnavailable');
  });

  it('signs an active admin in and goes to the dashboard', async () => {
    vi.stubGlobal('fetch', reply(200, { ok: true, user: LAB_USER }));
    findMock.mockResolvedValue([user()]);
    const res = await post('https://irish-tech.com', { token: 't', name: 'Forged' }, '4.4.4.4');
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location')!).pathname).toBe('/dashboard');
    expect(res.headers.get('set-cookie')).toContain('next-auth.session-token=');
  });

  it('sends a new admin to the waiting screen', async () => {
    vi.stubGlobal('fetch', reply(200, { ok: true, user: LAB_USER }));
    findMock.mockResolvedValue([]);
    const res = await post('https://irish-tech.com', { token: 't' }, '5.5.5.5');
    expect(res.headers.get('location')).toContain('/login?pending=1');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('limits attempts per address', async () => {
    vi.stubGlobal('fetch', reply(401));
    const statuses: number[] = [];
    for (let i = 0; i < 31; i++) {
      statuses.push((await post('https://irish-tech.com', { token: 't' }, '6.6.6.6')).status);
    }
    expect(statuses.slice(0, 30).every((s) => s === 303)).toBe(true);
    expect(statuses[30]).toBe(429);
  });
});
