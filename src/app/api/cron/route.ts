import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';

/** Constant-time compare that does not leak length through early return. */
function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/** Bearer token from the Authorization header -- never the query string, which lands in logs. */
function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length).trim() || null;
}

export async function GET(request: Request) {
  if (!secretMatches(bearerToken(request), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const action = new URL(request.url).searchParams.get('action');

  // These three jobs are not implemented. They previously returned success
  // strings, which made an unbuilt notification system look operational.
  const PLANNED = ['backup', 'recurring_meetings', 'reminders'];

  if (action && PLANNED.includes(action)) {
    return NextResponse.json(
      {
        error: 'Not implemented',
        action,
        message: `งาน "${action}" ยังไม่ได้พัฒนา — ดู README หัวข้อ Roadmap`,
      },
      { status: 501 }
    );
  }

  return NextResponse.json(
    { error: 'Invalid action', valid: PLANNED },
    { status: 400 }
  );
}
