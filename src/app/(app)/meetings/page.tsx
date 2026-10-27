import InfoTip from '@/lib/ui/info-tip';
import PageHeader from '@/lib/ui/page-header';
import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { MeetingRecord } from '@/lib/db/schema';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import CalendarView from './calendar';
import NewMeetingButton from './new-meeting-button';
import ConnectGoogleButton from './connect-google-button';
import ShareCalendar from './share-calendar';
import AutoRefresh from '@/lib/ui/auto-refresh';

import { getStoredToken, getConnectedUserIds } from '@/lib/google/tokens';
import { requirePageSession } from '@/lib/auth-guard';
import { labMembers } from '@/lib/members';
import { myEvents, busyTimes, type GoogleEvent } from '@/lib/google/calendar';
import type { CalendarShareRecord, PersonalEventRecord, UserRecord, TermBreakRecord, WeekLeadRecord } from '@/lib/db/schema';
import { leadsCurrentOrLater, planWeekLeads } from '@/lib/rotation';
import { nextWeekKey, weekKey } from '@/lib/week';
import { formatLabTime } from '@/lib/lab-time';
import { weekRange } from '@/lib/meeting-history';
import { SHARE_TTL_DAYS, shareIsLive } from '@/lib/calendar-share';
import { logError } from '@/lib/app-log';
import { facesOf } from '@/lib/avatar-face';

export type MappedMeeting = MeetingRecord & { owner_name?: string };
export type MappedPersonalEvent = PersonalEventRecord & { user_name?: string; user_color?: string };

export default async function MeetingsPage() {
  const actor = await requirePageSession();
  const [meetings, t, locale, storedToken, allPersonalEvents, users, termBreaks, weekLeads, allShares] = await Promise.all([
    SheetRepo.find<MeetingRecord>('meetings'),
    getT(),
    getLocale(),
    getStoredToken(actor.id).catch(() => null),
    SheetRepo.find<PersonalEventRecord>('personal_events').catch(() => []),
    SheetRepo.find<UserRecord>('users').catch(() => []),
    SheetRepo.find<TermBreakRecord>('term_breaks').catch(() => []),
    SheetRepo.find<WeekLeadRecord>('week_leads').catch(() => []),
    // Before the sheet has this tab, sharing just has nothing to list.
    SheetRepo.find<CalendarShareRecord>('calendar_shares').catch(() => []),
  ]);

  // Sharing a week: last week to two ahead, and the links still working that
  // this person may withdraw -- their own, or everybody's for admin.
  const thisWeek = weekKey();
  const aWeekAgo = new Date();
  aWeekAgo.setDate(aWeekAgo.getDate() - 7);
  const shareWeeks = [
    { key: weekKey(aWeekAgo), label: t('share.weekLast') },
    { key: thisWeek, label: t('share.weekThis') },
    { key: nextWeekKey(thisWeek), label: t('share.weekNext') },
    { key: nextWeekKey(nextWeekKey(thisWeek)), label: t('share.weekAfter') },
  ].map((w) => ({ ...w, range: weekRange(w.key, locale) }));
  const liveShares = allShares
    .filter((s) => shareIsLive(s) && (s.created_by === actor.id || actor.role === 'admin'))
    .map((s) => ({
      id: s.id,
      week: weekRange(s.week_key, locale),
      people: Array.isArray(s.user_ids) ? s.user_ids.length : 0,
      until: formatLabTime(s.expires_at, locale),
      rowVersion: s.row_version,
    }));

  // Whose week it is, for as far ahead as anybody plans: a term's worth past
  // today, and a few weeks back so paging to last week still says who ran it.
  // Past the last confirmed week these are where the arranged order lands,
  // skipping term breaks -- the same walk that confirms each week when it
  // comes, so the name shown ahead of time is the one that turns up.
  const planFrom = new Date();
  planFrom.setDate(planFrom.getDate() - 8 * 7);
  const weekPlan = planWeekLeads(users, weekLeads, termBreaks, weekKey(planFrom), 8 + 26);

  // Booking a meeting outright skips the poll, so it is admin's escape hatch.
  const canSchedule = actor.role === 'admin';
  // The button to the free-time page says what the reader goes there to do:
  // schedule, for whoever runs this week or a coming one; look, for the rest.
  const schedules = canSchedule || leadsCurrentOrLater(actor, weekLeads);

  const userMap = new Map(users.map(u => [u.id, u.name]));
  // Each person's colour, worked out over everybody so it is the same colour
  // their avatar wears on Tasks and in the free-time grid.
  const faces = facesOf(users);
  const colorOf = (id: string) => faces.get(id)?.color ?? '';

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
      user_name: userMap.get(pe.user_id) || 'Unknown',
      user_color: colorOf(pe.user_id),
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
  const allGoogleEvents: (GoogleEvent & { owner_name?: string; owner_id?: string; owner_color?: string })[] = [];
  
  await Promise.all(
    Array.from(connectedUserIds).filter(showsOnCalendar).map(async (uId) => {
      try {
        const userName = userMap.get(uId) || 'Unknown';
        if (uId === actor.id) {
          // Own events: full titles visible
          const events = await myEvents(uId, timeMin.toISOString(), timeMax.toISOString());
          events.forEach(e => { allGoogleEvents.push({ ...e, owner_name: userName, owner_id: uId, owner_color: colorOf(uId) }); });
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
              owner_color: colorOf(uId),
            });
          });
        }
      } catch (err) {
        logError('google_calendar', err, {
          message: `Failed to fetch Google events for user ${uId}`,
          userId: actor.id,
          path: '/meetings',
          detail: { calendarOf: uId },
        });
      }
    })
  );

  return (
    <div className="space-y-3">
      {/* As little as possible on a phone: the name, whether Google is
          connected, and the way to the availability grid. A wrapped
          description and a status pill on its own line once cost about 300px
          before the calendar began, on the page whose whole point is the
          calendar. What the page is for sits behind an ⓘ, on every screen
          without costing a line; the rest shrinks rather than disappearing. */}
      <PageHeader
        title={t('meetings.title')}
        // Connected is a dot and a word on a phone, the whole sentence on a
        // desktop. Not connected keeps its button at every width, because
        // that is the one part of it anybody can act on.
        aside={<>
        <InfoTip>
          <p>{t('meetings.hint')}</p>
          <p className="mt-1">{t('meetings.addBusyHint')}</p>
        </InfoTip>
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
            {/* "Google" stays at every width, as it does when connected: the
                cross and "connect" alone read as a close button. */}
            <svg aria-hidden="true" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="lg:hidden">Google</span>
            <span className="hidden lg:inline">Google Calendar: {t('calcard.notConnected')}</span>
            <ConnectGoogleButton />
          </span>
        )}</>}
        actions={
          <>
          <Link
            href="/meetings/polls"
            className="btn btn-primary"
          >
            {schedules ? t('meetings.findTime') : t('meetings.freeTimeSummary')}
          </Link>

          <ShareCalendar
            weeks={shareWeeks}
            thisWeek={thisWeek}
            people={labMembers(users).map((u) => ({ id: u.id, ...faces.get(u.id)! }))}
            shares={liveShares}
            days={SHARE_TTL_DAYS}
          />

          {/* Booking outright is the admin's escape hatch around the poll, and
              rare. It is not worth a row of a phone screen, so it waits for a
              wider one -- the poll route, which is the normal one, is beside
              it at every width. */}
          {canSchedule && (
            <span className="hidden sm:inline-flex">
              <NewMeetingButton />
            </span>
          )}
          </>
        }
      />
      {/* Other people's bookings and busy hours arrive on their own: once a
          minute while the page is open, and on coming back to the tab. */}
      <AutoRefresh every={60_000} />

      <CalendarView
        meetings={mappedMeetings} 
        personalEvents={mappedPersonalEvents} 
        googleEvents={allGoogleEvents} 
        currentUserId={actor.id} 
        termBreaks={termBreaks}
        weekPlan={weekPlan}
        people={users
          .filter((u) => showsOnCalendar(u.id))
          .map((u) => ({ id: u.id, ...faces.get(u.id)! }))}
      />
    </div>
  );
}
