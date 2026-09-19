import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { FeedbackRecord, UserRecord } from '@/lib/db/schema';

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

/**
 * Everything still waiting for somebody to decide on it.
 *
 * This exists for the review routine, which runs somewhere with no Google
 * credentials of its own and so cannot read the sheet directly. It is a read:
 * nothing here writes, and marking a piece of feedback done stays in the app,
 * where `row_version` and `audit_log` behave as they do for a person.
 *
 * `row_version` is included because whoever acts on the list needs the version
 * that came back with the row.
 */
async function openFeedback() {
  const [rows, users] = await Promise.all([
    SheetRepo.find<FeedbackRecord>('feedback', { fresh: true }),
    SheetRepo.find<UserRecord>('users'),
  ]);

  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  const items = rows
    .filter((row) => row.status === 'open')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((row) => ({
      id: row.id,
      body: row.body,
      category: row.category,
      created_at: row.created_at,
      // The name, not the email: this list is read by an automation, and the
      // author's address is no part of deciding what to build.
      author: nameOf.get(row.created_by) ?? 'unknown',
      row_version: row.row_version,
    }));

  return { count: items.length, items };
}

export async function GET(request: Request) {
  if (!secretMatches(bearerToken(request), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const action = new URL(request.url).searchParams.get('action');

  if (action === 'open_feedback') {
    return NextResponse.json(await openFeedback());
  }

  // These three jobs are not implemented. They previously returned success
  // strings, which made an unbuilt notification system look operational.
  const PLANNED = ['backup', 'recurring_meetings', 'reminders'];

  if (action && PLANNED.includes(action)) {
    return NextResponse.json(
      {
        error: 'Not implemented',
        action,
        message: `Job "${action}" is not built yet; see the Roadmap section of the README`,
      },
      { status: 501 }
    );
  }

  return NextResponse.json(
    { error: 'Invalid action', valid: ['open_feedback', ...PLANNED] },
    { status: 400 }
  );
}
