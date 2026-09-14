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
import { myEvents, type GoogleEvent } from '@/lib/google/calendar';
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
  
  // Fetch Google events (for next 30 days) for ALL connected users
  const connectedUserIds = await getConnectedUserIds();
  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - 7);
  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 30);

  const allGoogleEvents: (GoogleEvent & { owner_name?: string })[] = [];
  
  await Promise.all(
    Array.from(connectedUserIds).filter(showsOnCalendar).map(async (uId) => {
      try {
        const events = await myEvents(uId, timeMin.toISOString(), timeMax.toISOString());
        const userName = userMap.get(uId) || 'Unknown';
        events.forEach(e => {
          allGoogleEvents.push({
            ...e,
            owner_name: userName
          });
        });
      } catch (err) {
        console.error(`Failed to fetch Google events for user ${uId}:`, err);
      }
    })
  );

  return (
    <div className="space-y-4">
      {/* On a phone this header used to run to roughly 370px before the
          calendar began, so the thing the page is for started below the fold.
          The descriptive line and the connection pill are desktop-only now --
          the pill says nothing a member can act on from here, and Settings
          carries the same status with the real explanation beside it. */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{t('meetings.title')}</h2>
          <div className="hidden lg:flex items-center gap-3 text-sm">
            <p className="text-gray-500">{t('meetings.hint')}</p>
            {isCalendarSynced ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium bg-green-50 text-green-700 w-fit">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Google Calendar: {t('calcard.connected')}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-600 w-fit">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                Google Calendar: {t('calcard.notConnected')}
                <ConnectGoogleButton />
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/meetings/polls"
            className="inline-flex items-center justify-center h-10 px-3 sm:px-4 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition whitespace-nowrap"
          >
            {t('meetings.findTime')}
          </Link>
          {canSchedule && <NewMeetingButton />}
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
