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

// These three jobs are not implemented. They previously returned success
// strings, which made an unbuilt notification system look operational.
const PLANNED = ['backup', 'recurring_meetings', 'reminders'];

/**
 * What a read-only key may ask for.
 *
 * This is the whole point of having a second key. The routine that reviews
 * feedback runs on somebody else's cloud, so whatever it holds is a key kept
 * outside the lab -- and `CRON_SECRET` is checked before the action is even
 * read, which means one key opens every job on this endpoint, including every
 * job added to it later. A routine set up today to fetch feedback would
 * quietly gain the power to trigger a backup on the day `backup` is built.
 *
 * Keeping this list to reads is what stops that. Adding a job to PLANNED does
 * not widen it; only editing this line does.
 */
const READ_ACTIONS = ['open_feedback'];

export async function GET(request: Request) {
  const token = bearerToken(request);
  const action = new URL(request.url).searchParams.get('action');

  const full = secretMatches(token, process.env.CRON_SECRET);
  // Only consulted when the full key did not match, so setting both to the
  // same string is not a trap -- it just means one key that opens everything,
  // which is what an identical value says.
  const readOnly = !full && secretMatches(token, process.env.CRON_READ_SECRET);

  // Checked before the action is looked at, as before: somebody with no key
  // learns nothing about which jobs exist, not even whether they named a real
  // one.
  if (!full && !readOnly) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Told plainly, rather than as another 401. The caller already holds this
  // key, so being told what it is for reveals nothing -- and a 401 here would
  // send whoever set the routine up hunting for a typo in a key that is
  // perfectly correct.
  if (readOnly && !(action && READ_ACTIONS.includes(action))) {
    return NextResponse.json(
      {
        error: 'Forbidden',
        message: `This key is read-only; it may ask for: ${READ_ACTIONS.join(', ')}`,
      },
      { status: 403 }
    );
  }

  if (action === 'open_feedback') {
    return NextResponse.json(await openFeedback());
  }

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
