import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, hasManagerRights } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import {
  leadForWeek,
  meetingsInWeek,
  nextMeeting,
  rotationMembers,
  suggestNextHost,
  weeksLedBy,
} from '@/lib/rotation';
import NewMeetingButton from '../meetings/new-meeting-button';
import HostPicker from './host-picker';
import { weekKey } from '@/lib/week';
import { pollsAwaiting } from '@/lib/poll-tally';
import type {
  AvailabilityPollRecord,
  AvailabilitySlotRecord,
  AvailabilityVoteRecord,
  MeetingRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString(locale === 'th' ? 'th-TH' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default async function DashboardPage() {
  const [actor, users, meetings, leads, polls, slots, votes, t, locale] = await Promise.all([
    requireSession(),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MeetingRecord>('meetings'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    SheetRepo.find<AvailabilityPollRecord>('availability_polls'),
    SheetRepo.find<AvailabilitySlotRecord>('availability_slots'),
    SheetRepo.find<AvailabilityVoteRecord>('availability_votes'),
    getT(),
    getLocale(),
  ]);

  const upcoming = nextMeeting(meetings);
  const thisWeek = meetingsInWeek(meetings);
  const students = rotationMembers(users);
  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? '';

  // The duty belongs to the week itself, so it stands whether or not anything
  // has been scheduled yet.
  const thisWeekKey = weekKey();
  const lead = leadForWeek(leads, thisWeekKey);
  const confirmedHost = lead ? nameOf(lead.user_id) : '';
  const suggested = confirmedHost ? null : suggestNextHost(users, leads);

  // Asking is the lead's job, but answering is everyone's, and the ask is easy
  // to miss on a page nobody opens. It sits at the top of the page they do.
  const awaiting = pollsAwaiting(polls, slots, votes, actor.id);
  const canConfirm = hasManagerRights(actor.role);
  // Same rule the action enforces: whoever leads a week may book its meeting.
  const canSchedule = actor.role === 'admin' || weeksLedBy(leads, actor.id).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h2>
        {canSchedule && <NewMeetingButton />}
      </div>

      {awaiting.length > 0 && (
        <section className="p-5 sm:p-6 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
          <div>
            <h3 className="font-semibold text-amber-900">{t('dashboard.awaitingYou')}</h3>
            <p className="text-sm text-amber-800">{t('dashboard.awaitingHint')}</p>
          </div>

          <ul className="space-y-2">
            {awaiting.map(({ poll, remaining }) => (
              <li key={poll.id}>
                <Link
                  href={`/meetings/polls/${poll.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 bg-white rounded-lg border border-amber-200 hover:border-amber-400 transition"
                >
                  <span className="font-medium text-gray-900 flex-1 min-w-48">{poll.title}</span>
                  <span className="text-xs text-gray-500 tabular-nums">
                    {t('dashboard.awaitingSlots', { n: remaining })}
                  </span>
                  <span className="text-sm font-medium text-blue-600">
                    {t('dashboard.answerNow')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Next meeting -- scheduled, or plainly not */}
        <section className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
          <h3 className="text-sm font-semibold text-gray-500">{t('dashboard.nextMeeting')}</h3>

          {upcoming ? (
            <>
              <p className="text-xl font-bold text-gray-900">{upcoming.title}</p>
              <p className="text-sm text-gray-600 tabular-nums">
                {formatWhen(upcoming.start_at, locale)}
              </p>
              {upcoming.location && (
                <p className="text-sm text-gray-500">{upcoming.location}</p>
              )}
              <Link
                href={`/meetings/${upcoming.id}`}
                className="inline-block text-sm text-blue-600 hover:underline"
              >
                {t('dashboard.openMeeting')}
              </Link>
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-gray-900">{t('dashboard.notScheduled')}</p>
              <p className="text-sm text-gray-500">{t('dashboard.notScheduledHint')}</p>
              {canSchedule && (
                <Link
                  href="/meetings"
                  className="inline-block text-sm text-blue-600 hover:underline"
                >
                  {t('dashboard.scheduleNow')}
                </Link>
              )}
            </>
          )}
        </section>

        {/* Whose turn it is */}
        <section className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
          <h3 className="text-sm font-semibold text-gray-500">{t('rotation.title')}</h3>

          {students.length === 0 ? (
            <p className="text-sm text-gray-500">{t('rotation.noStudents')}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <p className="text-xl font-bold text-gray-900">
                  {confirmedHost || suggested?.name}
                </p>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    confirmedHost ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {confirmedHost ? t('rotation.confirmed') : t('rotation.suggested')}
                </span>
              </div>

              <p className="text-sm text-gray-500">
                {confirmedHost ? t('rotation.duty') : t('rotation.suggestedHint')}
              </p>

              {canConfirm && (
                <HostPicker
                  weekKey={thisWeekKey}
                  students={students.map((student) => ({ id: student.id, name: student.name }))}
                  hostId={lead?.user_id ?? ''}
                  suggestedId={suggested?.id ?? ''}
                />
              )}
            </>
          )}
        </section>
      </div>

      {/* This week at a glance */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-gray-600">{t('dashboard.thisWeek')}</h3>
          <Link href="/meetings" className="text-sm text-blue-600 hover:underline">
            {t('dashboard.addEvent')}
          </Link>
        </div>

        {thisWeek.length === 0 ? (
          <p className="p-5 text-sm text-gray-500 bg-gray-50 rounded-xl border border-gray-100">
            {t('dashboard.noMeetingsThisWeek')}
          </p>
        ) : (
          <ul className="space-y-2">
            {thisWeek.map((meeting) => (
              <li key={meeting.id}>
                <Link
                  href={`/meetings/${meeting.id}`}
                  className="block p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-gray-300 transition"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-semibold text-gray-900 flex-1 min-w-48">
                      {meeting.title}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {formatWhen(meeting.start_at, locale)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
