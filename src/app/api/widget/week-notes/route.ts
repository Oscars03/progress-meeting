import { NextResponse } from 'next/server';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { MeetingRecord, MinutesRecord, TaskRecord, TaskUpdateRecord } from '@/lib/db/schema';
import { NO_STORE, withWidgetKey } from '@/lib/widget-request';
import { buildWeekNotes, readWeekParam } from '@/lib/widget-week-notes';
import { activeWeekKey } from '@/lib/rotation';

/**
 * One week's minutes and progress reports as JSON, for whoever holds the key
 * -- the weekly debrief reads what was written down about the week.
 *
 *   ?week=YYYY-Www  (default: the active week, the one the dashboard and
 *                    /api/widget show; anything that is not a week key is 400)
 *
 * Same key, same refusals as /api/widget, and read-only in the same way:
 * nothing is written except the key's own "last used" day. What it may return
 * is decided in lib/widget-week-notes.ts.
 */
export async function GET(request: Request) {
  const asked = readWeekParam(new URL(request.url).searchParams);

  // The key is checked first, so somebody without one learns nothing --
  // not even that their week was malformed.
  const result = await withWidgetKey(
    request,
    async ({ users }) => {
      if (asked === false) return null;
      // No `.catch(() => [])` here, unlike the summary: a read that failed
      // would come back as "nothing was written down", and the debrief would
      // believe it. A 503 says what actually happened.
      const [meetings, minutes, tasks, updates] = await Promise.all([
        SheetRepo.find<MeetingRecord>('meetings'),
        SheetRepo.find<MinutesRecord>('minutes'),
        SheetRepo.find<TaskRecord>('tasks'),
        SheetRepo.find<TaskUpdateRecord>('task_updates'),
      ]);
      return buildWeekNotes({ users, meetings, minutes, tasks, updates }, asked ?? activeWeekKey(meetings));
    },
    { message: 'widget week notes failed', path: '/api/widget/week-notes' },
  );
  if ('response' in result) return result.response;

  if (result.value === null) {
    return NextResponse.json({ error: 'bad_week', expected: 'YYYY-Www' }, { status: 400, headers: NO_STORE });
  }
  return NextResponse.json(result.value, { headers: NO_STORE });
}
