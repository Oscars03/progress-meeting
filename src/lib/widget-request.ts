import { NextResponse } from 'next/server';
import { SheetRepo } from './db/sheet-repo';
import type {
  AvailabilityPollRecord,
  AvailabilitySlotRecord,
  AvailabilityVoteRecord,
  MeetingRecord,
  TaskRecord,
  TopicRecord,
  UserRecord,
  WidgetKeyRecord,
} from './db/schema';
import { widgetKeyFrom, widgetKeyMatches } from './widget-key';
import { buildWidgetSummary, type WidgetSummary } from './widget-summary';
import { labDay } from './lab-time';

/**
 * Everything /api/widget and /api/widget/image share: find whose key this is,
 * refuse it the same way whatever is wrong with it, and build their summary.
 *
 * Returns either the summary or the response to send instead.
 */
const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Whether this is somebody's browser rather than an app drawing a widget.
 *
 * A tap on the AnyWidget widget opens its address in the phone's browser,
 * which then showed the picture again instead of the app. AnyWidget draws the
 * page in an Android WebView, whose user agent carries "; wv)"; Chrome and the
 * other browsers do not. Anything without a browser's user agent at all is
 * treated as the widget, so an unexpected caller still gets the picture
 * rather than a sign-in page drawn into the widget.
 */
export function isBrowser(userAgent: string | null): boolean {
  if (!userAgent || !userAgent.startsWith('Mozilla/')) return false;
  return !/; wv\)/.test(userAgent);
}

function unauthorized() {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });
}

export async function loadWidgetSummary(
  request: Request,
): Promise<{ summary: WidgetSummary } | { response: NextResponse }> {
  const key = widgetKeyFrom(request);
  if (!key) return { response: unauthorized() };

  try {
    // Fresh, so a key revoked in Settings stops working on the next refresh
    // rather than whenever the read cache happens to expire.
    const keys = await SheetRepo.find<WidgetKeyRecord>('widget_keys', { fresh: true });
    const row = keys.find((candidate) => widgetKeyMatches(key, candidate.key_hash));
    if (!row) return { response: unauthorized() };

    const users = await SheetRepo.find<UserRecord>('users');
    const me = users.find((user) => user.id === row.user_id);
    // Deactivating somebody has to switch their widget off too.
    if (!me || me.active !== true) return { response: unauthorized() };

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

    return { summary };
  } catch (error) {
    console.error('widget summary failed', error);
    return {
      response: NextResponse.json({ error: 'unavailable' }, { status: 503, headers: NO_STORE }),
    };
  }
}
