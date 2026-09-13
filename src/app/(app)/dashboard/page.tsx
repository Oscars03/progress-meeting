import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, hasManagerRights } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { meetingsInWeek, nextMeeting, rotationMembers, suggestNextHost } from '@/lib/rotation';
import NewMeetingButton from '../meetings/new-meeting-button';
import HostPicker from './host-picker';
import type { MeetingRecord, UserRecord } from '@/lib/db/schema';

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
  const [actor, users, meetings, t, locale] = await Promise.all([
    requireSession(),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MeetingRecord>('meetings'),
    getT(),
    getLocale(),
  ]);

  const upcoming = nextMeeting(meetings);
  const thisWeek = meetingsInWeek(meetings);
  const students = rotationMembers(users);
  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? '';

  // The duty belongs to a meeting, so it hangs off this week's first meeting;
  // with none, the next one ahead is what there is to prepare for.
  const dutyMeeting = thisWeek[0] ?? upcoming;
  const confirmedHost = dutyMeeting?.host_id ? nameOf(dutyMeeting.host_id) : '';
  const suggested = confirmedHost ? null : suggestNextHost(users, meetings);
  const canConfirm = hasManagerRights(actor.role);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h2>
        <NewMeetingButton />
      </div>

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
              <Link
                href="/meetings"
                className="inline-block text-sm text-blue-600 hover:underline"
              >
                {t('dashboard.scheduleNow')}
              </Link>
            </>
          )}
        </section>

        {/* Whose turn it is */}
        <section className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
          <h3 className="text-sm font-semibold text-gray-500">{t('rotation.title')}</h3>

          {students.length === 0 ? (
            <p className="text-sm text-gray-500">{t('rotation.noStudents')}</p>
          ) : !dutyMeeting ? (
            <p className="text-sm text-gray-500">{t('rotation.needMeeting')}</p>
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
                  meetingId={dutyMeeting.id}
                  rowVersion={dutyMeeting.row_version}
                  students={students.map((student) => ({ id: student.id, name: student.name }))}
                  hostId={dutyMeeting.host_id ?? ''}
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
                    {meeting.host_id && (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
                        {nameOf(meeting.host_id)}
                      </span>
                    )}
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
