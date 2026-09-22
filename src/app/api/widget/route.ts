import { NextResponse } from 'next/server';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type {
  AvailabilityPollRecord,
  AvailabilitySlotRecord,
  AvailabilityVoteRecord,
  MeetingRecord,
  TaskRecord,
  TopicRecord,
  UserRecord,
  WidgetKeyRecord,
} from '@/lib/db/schema';
import { widgetKeyFrom, widgetKeyMatches } from '@/lib/widget-key';
import { buildWidgetSummary } from '@/lib/widget-summary';
import { labDay } from '@/lib/lab-time';

/**
 * One person's summary for their phone widget (Scriptable on iPhone, KWGT on
 * Android). Read-only: nothing a widget key can reach writes anything except
 * the key's own "last used" day.
 *
 * Every refusal is the same 401 with the same body, so a caller cannot tell a
 * wrong key from a revoked one or from a deactivated account.
 */
function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: Request) {
  const key = widgetKeyFrom(request);
  if (!key) return unauthorized();

  try {
    // Fresh, so a key revoked in Settings stops working on the next refresh
    // rather than whenever the read cache happens to expire.
    const keys = await SheetRepo.find<WidgetKeyRecord>('widget_keys', { fresh: true });
    const row = keys.find((candidate) => widgetKeyMatches(key, candidate.key_hash));
    if (!row) return unauthorized();

    const users = await SheetRepo.find<UserRecord>('users');
    const me = users.find((user) => user.id === row.user_id);
    // Deactivating somebody has to switch their widget off too.
    if (!me || me.active !== true) return unauthorized();

    const [meetings, topics, tasks, polls, slots, votes] = await Promise.all([
      SheetRepo.find<MeetingRecord>('meetings'),
      SheetRepo.find<TopicRecord>('topics').catch(() => []),
      SheetRepo.find<TaskRecord>('tasks').catch(() => []),
      SheetRepo.find<AvailabilityPollRecord>('availability_polls').catch(() => []),
      SheetRepo.find<AvailabilitySlotRecord>('availability_slots').catch(() => []),
      SheetRepo.find<AvailabilityVoteRecord>('availability_votes').catch(() => []),
    ]);

    const summary = buildWidgetSummary({ users, meetings, topics, tasks, polls, slots, votes }, me.id);

    // A widget refreshes every quarter hour or so, and every update writes an
    // audit row. Once a lab day is plenty to answer "is this key still in use?".
    const today = labDay(new Date());
    if (row.last_used_at !== today) {
      await SheetRepo.update<WidgetKeyRecord>('widget_keys', row.id, { last_used_at: today }, row.row_version, me.id)
        // Losing the date is not worth failing the widget over.
        .catch(() => undefined);
    }

    return NextResponse.json(summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('widget summary failed', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
