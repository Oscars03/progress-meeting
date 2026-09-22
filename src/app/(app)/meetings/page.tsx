import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { MeetingRecord } from '@/lib/db/schema';
import { getT } from '@/lib/ui/server-i18n';
import CalendarView from './calendar';
import NewMeetingButton from './new-meeting-button';
import ConnectGoogleButton from './connect-google-button';

import { getStoredToken, getConnectedUserIds } from '@/lib/google/tokens';
import { requireSession } from '@/lib/auth-guard';
import { labMembers } from '@/lib/members';
import { myEvents, busyTimes, type GoogleEvent } from '@/lib/google/calendar';
import type { PersonalEventRecord, UserRecord, TermBreakRecord } from '@/lib/db/schema';

export type MappedMeeting = MeetingRecord & { owner_name?: string };
export type MappedPersonalEvent = PersonalEventRecord & { user_name?: string };

export default async function MeetingsPage() {
  const actor = await requireSession();
  const [meetings, t, storedToken, allPersonalEvents, users, termBreaks] = await Promise.all([
    SheetRepo.find<MeetingRecord>('meetings'), 
    getT(),
    getStoredToken(actor.id).catch(() => null),
    SheetRepo.find<PersonalEventRecord>('personal_events').catch(() => []),
    SheetRepo.find<UserRecord>('users').catch(() => []),
    SheetRepo.find<TermBreakRecord>('term_breaks').catch(() => []),
  ]);

  // Booking a meeting outright skips the poll, so it is admin's escape hatch.
  const canSchedule = actor.role === 'admin';

  const userMap = new Map(users.map(u => [u.id, u.name]));

  // The calendar is the lab's week. An admin is the account that administers
  // the app rather than somebody the week has to accommodate, so its personal
  // hours are not other people's business and its name does not belong on a
  // shared calendar. Its own owner still sees them, because they are theirs.
  const memberIds = new Set(labMembers(users).map((u) => u.id));
  const showsOnCalendar = (userId: string) => memberIds.has(userId) || userId === actor.id;

  const mappedMeetings: MappedMeeting[] = meetings.map(m => ({
    ...m,
    owner_name: userMap.get(m.owner_id) || 'Unknown'
  }));

  const mappedPersonalEvents: MappedPersonalEvent[] = allPersonalEvents
    .filter((pe) => showsOnCalendar(pe.user_id))
    .map(pe => ({
      ...pe,
      user_name: userMap.get(pe.user_id) || 'Unknown'
    }));

  const isCalendarSynced = Boolean(storedToken);
  
  // Fetch calendar data for the shared view.
  // Privacy: other people's events show only as "Busy" blocks (freebusy API).
  // Only the current user's own events carry their real titles.
  const connectedUserIds = await getConnectedUserIds();
  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 7);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 30);

  // owner_id as well as the name: the calendar's "only mine" filter has to
  // compare ids, and a display name is not an identity.
  const allGoogleEvents: (GoogleEvent & { owner_name?: string; owner_id?: string })[] = [];
  
  await Promise.all(
    Array.from(connectedUserIds).filter(showsOnCalendar).map(async (uId) => {
      try {
        const userName = userMap.get(uId) || 'Unknown';
        if (uId === actor.id) {
          // Own events: full titles visible
          const events = await myEvents(uId, timeMin.toISOString(), timeMax.toISOString());
          events.forEach(e => { allGoogleEvents.push({ ...e, owner_name: userName, owner_id: uId }); });
        } else {
          // Others: freebusy only — no titles, no privacy leak
          const intervals = await busyTimes(uId, timeMin.toISOString(), timeMax.toISOString());
          intervals.forEach(b => {
            allGoogleEvents.push({
              id: `busy-${uId}-${b.start}`,
              title: 'Busy',
              start: b.start,
              end: b.end,
              owner_name: userName,
              owner_id: uId,
            });
          });
        }
      } catch (err) {
        console.error(`Failed to fetch Google events for user ${uId}:`, err);
      }
    })
  );

  return (
    <div className="space-y-3">
      {/* One row on a phone, and everything still on it: the name, whether
          Google is connected, and the way to the availability grid. The two
          lines this used to take -- a wrapped description and a status pill on
          its own -- cost about 300px before the calendar began, on the page
          whose whole point is the calendar. The descriptive line stays behind
          a wider screen; the rest shrinks rather than disappearing. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg sm:text-2xl font-bold text-gray-900">{t('meetings.title')}</h2>

        {/* Connected is a dot and a word on a phone, the whole sentence on a
            desktop. Not connected keeps its button at every width, because
            that is the one part of it anybody can act on. */}
        {isCalendarSynced ? (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="lg:hidden">Google</span>
            <span className="hidden lg:inline">Google Calendar: {t('calcard.connected')}</span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="hidden lg:inline">Google Calendar: {t('calcard.notConnected')}</span>
            <ConnectGoogleButton />
          </span>
        )}

        <p className="hidden xl:block text-sm text-gray-500">{t('meetings.hint')}</p>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/meetings/polls"
            className="inline-flex items-center justify-center h-10 px-4 text-sm sm:text-base font-semibold text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 transition whitespace-nowrap"
          >
            {t('meetings.findTime')}
          </Link>

          {/* Booking outright is the admin's escape hatch around the poll, and
              rare. It is not worth a row of a phone screen, so it waits for a
              wider one -- the poll route, which is the normal one, is beside
              it at every width. */}
          {canSchedule && (
            <span className="hidden sm:inline-flex">
              <NewMeetingButton />
            </span>
          )}
        </div>
      </div>

      <CalendarView 
        meetings={mappedMeetings} 
        personalEvents={mappedPersonalEvents} 
        googleEvents={allGoogleEvents} 
        currentUserId={actor.id} 
        termBreaks={termBreaks}
      />
    </div>
  );
}
