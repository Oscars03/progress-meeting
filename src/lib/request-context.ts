import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { headers } from 'next/headers';
import { authOptions } from './auth';
import { pathOnly } from './app-log';

/**
 * Who is asking, and from which page -- for a log row, and for nothing else.
 *
 * Best effort by design: a log entry with no name on it is still worth more
 * than a log entry that failed because reading the session did. Nothing here
 * throws, and nothing it answers decides what anybody may do.
 */
export async function requestContext(): Promise<{ userId: string; path: string }> {
  let userId = '';
  let path = '';

  try {
    const session = await getServerSession(authOptions);
    userId = session?.user?.id ?? '';
  } catch {
    // Outside a request, or a session that cannot be read.
  }

  try {
    // A server action is a POST to the page it was pressed on, and the browser
    // names that page in the referer.
    path = pathOnly((await headers()).get('referer'));
  } catch {
    // Outside a request.
  }

  return { userId, path };
}

/** "a=1; b=2" as { a: '1', b: '2' }. */
export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (!name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

/**
 * The signed-in user's id from a raw Cookie header.
 *
 * For `onRequestError`, which is handed the request's headers as a plain
 * object rather than run inside the request, so `getServerSession` has nothing
 * to read. The session cookie is decoded exactly as NextAuth does it.
 */
export async function userIdFromCookieHeader(header: string | null | undefined): Promise<string> {
  try {
    const cookies = parseCookies(header);
    if (Object.keys(cookies).length === 0) return '';
    const token = await getToken({ req: { cookies, headers: {} } as never });
    return typeof token?.id === 'string' ? token.id : '';
  } catch {
    return '';
  }
}
