import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logEvent } from '@/lib/app-log';
import {
  MAX_CLIENT_REPORT_BODY,
  allowedAnonymousReport,
  allowedReport,
  parseClientReport,
  sameOrigin,
  type ClientReport,
} from '@/lib/client-report';

/**
 * Where the browser reports what the server cannot see: an error thrown in a
 * click handler or while rendering on the phone, and which page somebody
 * opened. Written to the app log -- see lib/app-log.ts and lib/client-log.ts.
 *
 * Open to people who are not signed in, for errors only: the login page is the
 * part of the app most likely to break and the one where nobody has a session.
 * That makes it a public way to write to the sheet, so everything about it is
 * small -- same-origin only, a few kilobytes per report, a few dozen reports a
 * minute per person -- and a page view is only taken from somebody signed in.
 */

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response(null, { status: 403 });

  const raw = await request.text();
  if (raw.length > MAX_CLIENT_REPORT_BODY) return new Response(null, { status: 413 });

  let report: ClientReport | null = null;
  try {
    report = parseClientReport(JSON.parse(raw));
  } catch {
    // Not JSON.
  }
  if (!report) return new Response(null, { status: 400 });

  const session = await getServerSession(authOptions).catch(() => null);
  const userId = session?.user?.id ?? '';

  // A view says who used what; with nobody signed in there is nobody to name.
  if (report.kind === 'view' && !userId) return new Response(null, { status: 204 });

  const now = Date.now();
  const who = userId || `anon:${request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? ''}`;
  if (!allowedReport(`${report.kind}:${who}`, now)) return new Response(null, { status: 429 });
  if (!userId && !allowedAnonymousReport(now)) return new Response(null, { status: 429 });

  if (report.kind === 'view') {
    logEvent({ level: 'info', event: 'view', userId, path: report.path });
  } else {
    logEvent({
      level: 'error',
      event: 'client_error',
      message: report.message,
      userId,
      path: report.path,
      detail: {
        ...(report.stack ? { stack: report.stack } : {}),
        ...(report.digest ? { digest: report.digest } : {}),
        ...(report.source ? { source: report.source } : {}),
        userAgent: request.headers.get('user-agent') ?? '',
        env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
      },
    });
  }

  return new Response(null, { status: 204 });
}
