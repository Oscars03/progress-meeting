import type { Instrumentation } from 'next';
import { logError, requestFlush } from './app-log';
import { userIdFromCookieHeader } from './request-context';

/** How long a failed request may be held up for its log row to reach the sheet. */
const WAIT_FOR_WRITE_MS = 3_000;

type Args = Parameters<Instrumentation.onRequestError>;

function header(headers: Args[1]['headers'], name: string): string {
  const value = headers[name];
  return Array.isArray(value) ? value.join('; ') : (value ?? '');
}

/**
 * A page, route or action that threw, as Next reports it to instrumentation.ts.
 *
 * This is everything the app did not catch itself: a Server Component that
 * threw while rendering, a route handler that fell over, an action not wrapped
 * in toResult. Next prints these already, so this only keeps a copy.
 *
 * Only the cookie is read from the headers, to put a name on the row -- never
 * stored. The user agent is, since "only on my phone" is half of most reports.
 */
export async function recordRequestError(...[error, request, context]: Args): Promise<void> {
  try {
    const userId = await userIdFromCookieHeader(header(request.headers, 'cookie'));

    logError('server_error', error, {
      message: `${context.routeType} ${request.method} ${request.path.split('?')[0]}`,
      userId,
      path: request.path,
      quiet: true,
      detail: {
        method: request.method,
        routePath: context.routePath,
        routeType: context.routeType,
        ...(context.renderSource ? { renderSource: context.renderSource } : {}),
        userAgent: header(request.headers, 'user-agent'),
      },
    });

    // Waited for, not left to run: there may be no request left to keep the
    // instance alive for it once this returns. Bounded, because the error
    // might be that the sheet is not answering.
    await Promise.race([
      requestFlush(0),
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, WAIT_FOR_WRITE_MS);
        (timer as { unref?: () => void }).unref?.();
      }),
    ]);
  } catch (e) {
    console.error('app log: could not record a request error:', e);
  }
}
