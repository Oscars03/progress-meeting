/**
 * /api/log -- the browser's way into the app log -- and the reporter that
 * calls it.
 *
 * The endpoint is public (the login page has no session and is the likeliest
 * page to break), so the things worth proving are what it refuses: another
 * site, an oversized body, a shape it does not know, a page view with nobody
 * signed in, and a page that reports in a loop.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const logEvent = vi.fn();
let session: { user: { id: string } } | null = null;

vi.mock('../lib/app-log', () => ({ logEvent }));
vi.mock('next-auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next-auth')>()),
  getServerSession: async () => session,
}));

const { POST } = await import('../app/api/log/route');
const { parseClientReport, resetClientReportLimits, sameOrigin } = await import('../lib/client-report');
const { isNoise } = await import('../lib/client-log');

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request('https://app.example/api/log', {
      method: 'POST',
      headers: { host: 'app.example', origin: 'https://app.example', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  logEvent.mockReset();
  resetClientReportLimits();
  session = { user: { id: 'u-1' } };
});

describe('parseClientReport', () => {
  it('takes a page view with a path on this site', () => {
    expect(parseClientReport({ kind: 'view', path: '/tasks?x=1' })).toEqual({ kind: 'view', path: '/tasks' });
  });

  it('refuses a path that leaves the site', () => {
    expect(parseClientReport({ kind: 'view', path: 'https://evil.example/' })).toBeNull();
    expect(parseClientReport({ kind: 'view', path: '//evil.example/' })).toBeNull();
  });

  it('takes an error, trimming what is too long', () => {
    const report = parseClientReport({
      kind: 'error',
      message: 'x'.repeat(5_000),
      stack: 'at foo',
      digest: 'd1',
      source: 'window',
      path: '/dashboard',
    });
    expect(report).toMatchObject({ kind: 'error', stack: 'at foo', digest: 'd1', source: 'window', path: '/dashboard' });
    expect(report && 'message' in report && report.message.length).toBe(1_000);
  });

  it('refuses an error with no message, and any other shape', () => {
    expect(parseClientReport({ kind: 'error', message: '' })).toBeNull();
    expect(parseClientReport({ kind: 'delete-everything' })).toBeNull();
    expect(parseClientReport(null)).toBeNull();
    expect(parseClientReport('view')).toBeNull();
  });

  it('drops a source it does not know rather than storing it', () => {
    const report = parseClientReport({ kind: 'error', message: 'm', source: '<script>' });
    expect(report && 'source' in report && report.source).toBe('');
  });
});

describe('sameOrigin', () => {
  const req = (headers: Record<string, string>) => new Request('https://app.example/api/log', { headers });

  it('accepts a matching Origin, or Sec-Fetch-Site when there is none', () => {
    expect(sameOrigin(req({ host: 'app.example', origin: 'https://app.example' }))).toBe(true);
    expect(sameOrigin(req({ host: 'app.example', 'sec-fetch-site': 'same-origin' }))).toBe(true);
  });

  it('refuses another site, and a request that says nothing', () => {
    expect(sameOrigin(req({ host: 'app.example', origin: 'https://evil.example' }))).toBe(false);
    expect(sameOrigin(req({ host: 'app.example', 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(sameOrigin(req({ host: 'app.example' }))).toBe(false);
  });
});

describe('POST /api/log', () => {
  it('records a page view against the person signed in', async () => {
    const res = await post({ kind: 'view', path: '/meetings' });
    expect(res.status).toBe(204);
    expect(logEvent).toHaveBeenCalledWith({ level: 'info', event: 'view', userId: 'u-1', path: '/meetings' });
  });

  it('takes no page view from somebody not signed in', async () => {
    session = null;
    const res = await post({ kind: 'view', path: '/dashboard' });
    expect(res.status).toBe(204);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('takes an error from somebody not signed in -- the login page is where they happen', async () => {
    session = null;
    const res = await post(
      { kind: 'error', message: 'TypeError: x is undefined', stack: 'at login', path: '/login', source: 'window' },
      { 'user-agent': 'Mobile Safari' }
    );
    expect(res.status).toBe(204);
    expect(logEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'error',
        event: 'client_error',
        userId: '',
        path: '/login',
        message: 'TypeError: x is undefined',
        detail: expect.objectContaining({ stack: 'at login', source: 'window', userAgent: 'Mobile Safari' }),
      })
    );
  });

  it('refuses another site', async () => {
    const res = await post({ kind: 'view', path: '/x' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('refuses a body too big, or not JSON, or not a report', async () => {
    expect((await post({ kind: 'error', message: 'm', stack: 'x'.repeat(20_000) })).status).toBe(413);
    expect((await post('not json')).status).toBe(400);
    expect((await post({ kind: 'nope' })).status).toBe(400);
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('stops taking reports from one person after thirty a minute', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 35; i++) {
      statuses.push((await post({ kind: 'error', message: `e${i}` })).status);
    }
    expect(statuses.filter((s) => s === 204)).toHaveLength(30);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
    // Page views are counted apart: a crash loop does not stop the trail.
    expect((await post({ kind: 'view', path: '/tasks' })).status).toBe(204);
  });

  it('takes no more than two hundred a day from people not signed in, however many addresses they use', async () => {
    session = null;
    const statuses: number[] = [];
    for (let i = 0; i < 210; i++) {
      statuses.push((await post({ kind: 'error', message: `e${i}` }, { 'x-forwarded-for': `10.0.${i >> 8}.${i & 255}` })).status);
    }
    expect(statuses.filter((s) => s === 204)).toHaveLength(200);

    // Somebody signed in is not held to the strangers' allowance.
    session = { user: { id: 'u-1' } };
    expect((await post({ kind: 'error', message: 'mine' })).status).toBe(204);
  });
});

describe('the reporter in the browser', () => {
  it('ignores what says nothing about this app', () => {
    expect(isNoise('Script error.', '')).toBe(true);
    expect(isNoise('ResizeObserver loop completed with undelivered notifications.', '')).toBe(true);
    expect(isNoise('TypeError: boom', 'at x (chrome-extension://abc/content.js:1:1)')).toBe(true);
    expect(isNoise('TypeError: boom', 'at x (https://app.example/_next/static/chunks/1.js:1:1)')).toBe(false);
  });

  describe('sending', () => {
    const beacons: string[] = [];

    beforeEach(() => {
      beacons.length = 0;
      vi.stubGlobal('window', { location: { pathname: '/tasks' } });
      vi.stubGlobal('navigator', {
        sendBeacon: (_url: string, blob: Blob) => {
          void blob.text().then((t) => beacons.push(t));
          return true;
        },
      });
      vi.resetModules();
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('sends the same error once, and no more than ten in all', async () => {
      const { reportClientError } = await import('../lib/client-log');
      const same = new Error('same');
      reportClientError(same, { source: 'window' });
      reportClientError(same, { source: 'window' });
      for (let i = 0; i < 20; i++) reportClientError(new Error(`n${i}`), { source: 'promise' });
      await new Promise((r) => setTimeout(r, 0));

      expect(beacons).toHaveLength(10);
      expect(JSON.parse(beacons[0])).toMatchObject({ kind: 'error', message: 'Error: same', path: '/tasks', source: 'window' });
    });

    it('counts a page once when it is reported twice in a row', async () => {
      const { reportView } = await import('../lib/client-log');
      reportView('/dashboard');
      reportView('/dashboard');
      reportView('/tasks');
      await new Promise((r) => setTimeout(r, 0));

      expect(beacons.map((b) => JSON.parse(b).path)).toEqual(['/dashboard', '/tasks']);
    });
  });
});
