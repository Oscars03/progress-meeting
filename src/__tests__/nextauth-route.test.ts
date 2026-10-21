/**
 * NextAuth's `_log` endpoint.
 *
 * It hands its body to whatever `logger` the options name, and lib/auth.ts
 * names one now so NextAuth's own errors reach the app log. Left alone, that
 * would let anybody on the internet write to the log; the route answers the
 * endpoint itself instead, so it does what it did before: nothing.
 */

import { describe, it, expect, vi } from 'vitest';

const handler = vi.fn(async () => new Response('from nextauth'));
vi.mock('next-auth', () => ({ default: () => handler }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

const { POST, GET } = await import('../app/api/auth/[...nextauth]/route');

const ctx = (...nextauth: string[]) => ({ params: Promise.resolve({ nextauth }) });
const req = () => new Request('https://app.example/api/auth/x', { method: 'POST' }) as never;

describe('the NextAuth route', () => {
  it('never lets a POST to _log reach NextAuth', async () => {
    const res = await POST(req(), ctx('_log'));
    expect(res.status).toBe(204);
    expect(handler).not.toHaveBeenCalled();
  });

  it('passes every other POST through untouched', async () => {
    await POST(req(), ctx('callback', 'credentials'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('leaves GET to NextAuth', () => {
    expect(GET).toBe(handler);
  });
});
