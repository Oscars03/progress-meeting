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
} from '@/lib/rotation';
import NewMeetingButton from '../meetings/new-meeting-button';
import HostPicker from './host-picker';
import { weekKey } from '@/lib/week';
import { openPolls } from '@/lib/poll-tally';
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
  // The next meeting has its own card above, so listing it again under "this
  // week" says the same thing twice. What is left is what the card does not
  // already show.
  const restOfWeek = thisWeek.filter((meeting) => meeting.id !== upcoming?.id);
  const thisWeekKey = weekKey();
  const lead = leadForWeek(leads, thisWeekKey);
  const confirmedHost = lead ? nameOf(lead.user_id) : '';
  const suggested = confirmedHost ? null : suggestNextHost(users, leads);

  // Asking is the lead's job, but answering is everyone's, and the ask is easy
  // to miss on a page nobody opens. It sits at the top of the page they do.
  const open = openPolls(polls, slots, votes, actor.id);
  const awaiting = open.filter((row) => row.remaining > 0);
  const answered = open.filter((row) => row.remaining === 0);
  const canConfirm = hasManagerRights(actor.role);
  // Booking a meeting outright skips the poll, so it is admin's escape hatch.
  // Everyone else schedules by proposing times and confirming the winner.
  const canSchedule = actor.role === 'admin';

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

      {/* Next meeting -- scheduled, or plainly not -- with the week's lead
          along the bottom. The duty is not a separate topic from the meeting
          it prepares, and as its own card it took a whole column to say one
          name. */}
      <section className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
        <h3 className="text-sm font-semibold text-gray-500">{t('dashboard.nextMeeting')}</h3>

        {upcoming ? (
          <>
            <p className="text-xl font-bold text-gray-900">{upcoming.title}</p>
            <p className="text-sm text-gray-600 tabular-nums">
              {formatWhen(upcoming.start_at, locale)}
            </p>
            {upcoming.location && <p className="text-sm text-gray-500">{upcoming.location}</p>}
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

        {/* The lead stands whether or not anything is scheduled, so this strip
            shows in both states above. */}
        <div className="pt-3 border-t border-gray-100 space-y-2">
          {students.length === 0 ? (
            <p className="text-sm text-gray-500">
              <span className="text-gray-400">{t('rotation.title')}: </span>
              {t('rotation.noStudents')}
            </p>
          ) : (
            <>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="text-gray-500">{t('rotation.title')}:</span>
                <span className="font-semibold text-gray-900">
                  {confirmedHost || suggested?.name}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    confirmedHost ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
                  }`}
                >
                  {confirmedHost ? t('rotation.confirmed') : t('rotation.suggested')}
                </span>
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
        </div>
      </section>

      {/* Answered, but still open: quieter than the amber card above, because
          it is not something to do -- it is somewhere to go back to. */}
      {answered.length > 0 && (
        <section className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-500">{t('dashboard.answeredPolls')}</h3>
            <p className="text-sm text-gray-500">{t('dashboard.answeredHint')}</p>
          </div>

          <ul className="space-y-2">
            {answered.map(({ poll }) => (
              <li key={poll.id}>
                <Link
                  href={`/meetings/polls/${poll.id}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1.5 p-3 rounded-lg border border-gray-200 hover:border-gray-400 transition"
                >
                  <span className="font-medium text-gray-900 flex-1 min-w-48">{poll.title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                    {t('polls.myDone')}
                  </span>
                  <span className="text-sm font-medium text-blue-600">
                    {t('dashboard.editAnswer')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* What the card above does not already show */}
      {restOfWeek.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-600">{t('dashboard.restOfWeek')}</h3>

          <ul className="space-y-2">
            {restOfWeek.map((meeting) => (
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
        </section>
      )}

    </div>
  );
}
