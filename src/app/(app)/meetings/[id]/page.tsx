import Link from 'next/link';
import BackLink from '@/lib/ui/back-link';
import { notFound } from 'next/navigation';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession } from '@/lib/auth-guard';
import type {
  ActionItemRecord,
  MeetingRecord,
  MinutesRecord,
  TaskRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';
import { actsAsWeekLead, leadForWeek, rotationMembers, suggestNextHost } from '@/lib/rotation';
import { weekKey } from '@/lib/week';
import { isMember } from '@/lib/members';
import HostPicker from '../../dashboard/host-picker';
import MinutesEditor from './minutes-editor';
import ActionItems from './action-items';
import CalendarSync from './calendar-sync';
import DeleteMeeting from './delete-meeting';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { formatLabTime } from '@/lib/lab-time';

export default async function MeetingDetailPage(props: PageProps<'/meetings/[id]'>) {
  const { id } = await props.params;
  const [actor, t, locale] = await Promise.all([requirePageSession(), getT(), getLocale()]);

  const meetings = await SheetRepo.find<MeetingRecord>('meetings');
  // A miss may just be a cached list from before another instance inserted the
  // meeting, so check a fresh read before calling it gone. See SheetRepo.find.
  const meeting =
    meetings.find((m) => m.id === id) ??
    (await SheetRepo.find<MeetingRecord>('meetings', { fresh: true })).find((m) => m.id === id);
  if (!meeting) notFound();

  const [users, allMinutes, allItems, tasks, leads] = await Promise.all([
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MinutesRecord>('minutes'),
    SheetRepo.find<ActionItemRecord>('action_items'),
    SheetRepo.find<TaskRecord>('tasks'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
  ]);

  const people = users
    .filter(isMember)
    .map((u) => ({ id: u.id, name: u.name }));

  const minutes = allMinutes.find((m) => m.meeting_id === id) ?? null;
  const items = allItems.filter((i) => i.meeting_id === id);

  // Only unfinished tasks are worth linking a follow-up to.
  const openTasks = tasks
    .filter((t) => t.status !== 'done')
    .map((t) => ({ id: t.id, title: t.title }));

  // Naming the week's lead is admin's; everything else this page can change
  // belongs to whoever runs the week -- see canRemove.
  const canManage = actor.role === 'admin';
  const students = rotationMembers(users);
  // The duty is the week's, so this meeting shows whoever holds the week it
  // falls in -- the same person the dashboard shows, by construction.
  const meetingWeek = meeting.start_at ? weekKey(new Date(meeting.start_at)) : weekKey();
  const lead = leadForWeek(leads, meetingWeek);
  const hostName = lead ? (users.find((u) => u.id === lead.user_id)?.name ?? '') : '';
  // Whoever runs the week owns its schedule, so the lead can undo their own
  // booking. Admin can always step in.
  const canRemove = actor.role === 'admin' || actsAsWeekLead(actor, leads, meetingWeek);

  /**
   * Whether anything has changed since the event was last sent to Google.
   *
   * A push is not free -- it re-invites every member -- so the button is not
   * offered when there is nothing new to send, and comes back the moment the
   * meeting is edited.
   *
   * The comparison needs a moment's slack, and this is why: recording the sync
   * *is itself a write to the row*, so `updated_at` always lands a fraction
   * after the `google_synced_at` it just stored. Measured on the live row, 215
   * milliseconds. A plain `>` therefore reported every freshly-synced meeting
   * as having unsent changes -- always true, which is the same as not asking.
   *
   * A minute separates "the sync's own write" from "a person edited this
   * afterwards" by a wide margin in both directions: the first is always under
   * a second, the second never is.
   */
  const SYNC_WRITE_SLACK_MS = 60_000;
  const syncedAtMs = Date.parse(meeting.google_synced_at ?? '');
  const updatedAtMs = Date.parse(meeting.updated_at ?? '');
  const hasUnsentChanges =
    Number.isNaN(syncedAtMs) || updatedAtMs > syncedAtMs + SYNC_WRITE_SLACK_MS;
  const suggestedHost = hostName ? null : suggestNextHost(users, leads);
  const calendarOwner = users.find((u) => u.id === meeting.google_calendar_owner_id);
  // This showed the two stored instants verbatim -- "2026-09-25T01:00:00.000Z"
  // twice, on the page that is meant to tell you when the meeting is.
  const when = [meeting.start_at, meeting.end_at]
    .map((iso) => formatLabTime(iso, locale))
    .filter(Boolean)
    .join(' — ');

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <BackLink href="/meetings" className="text-sm text-blue-600 hover:underline">
          {t('polls.backToCalendar')}
        </BackLink>
        <h2 className="text-2xl font-bold text-gray-900">{meeting.title}</h2>
        <p className="text-sm text-gray-500">
          <span className="text-sm text-gray-500 tabular-nums">
            {when || t('meeting.noTime')}
          </span>
          {meeting.location ? ` · ${meeting.location}` : ''}
        </p>
      </div>

      <section className="p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="text-lg font-semibold text-gray-900">{t('rotation.title')}</h3>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              lead ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {lead ? t('rotation.confirmed') : t('rotation.suggested')}
          </span>
        </div>

        <p className="text-sm text-gray-500">{t('rotation.duty')}</p>

        {students.length === 0 ? (
          <p className="text-sm text-gray-500">{t('rotation.noStudents')}</p>
        ) : (
          <>
            <p className="text-base font-semibold text-gray-900">
              {hostName || suggestedHost?.name}
            </p>

            {lead?.user_id === actor.id && (
              <div className="pt-2">
                <Link
                  href="/tasks/weekly"
                  className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm transition"
                >
                  {t('weekly.recordProgress', { fallback: 'Record Weekly Progress' })}
                </Link>
              </div>
            )}

            {canManage && (
              <HostPicker
                weekKey={meetingWeek}
                students={students.map((s) => ({ id: s.id, name: s.name }))}
                hostId={lead?.user_id ?? ''}
                suggestedId={suggestedHost?.id ?? ''}
              />
            )}
          </>
        )}
      </section>

      {/* Same rule as removing the meeting: the week's schedule belongs to
          the week's lead, and admin can step in. */}
      <CalendarSync
        meetingId={id}
        linked={Boolean(meeting.google_event_id)}
        syncedAt={meeting.google_synced_at ?? ''}
        ownerName={calendarOwner?.name ?? t('meeting.eventCreator')}
        canSync={canRemove}
        hasUnsentChanges={hasUnsentChanges}
      />

      {/* Everybody reads the record of the meeting; the lead writes it. */}
      <MinutesEditor
        meetingId={id}
        initialContent={minutes?.content ?? ''}
        minutesId={minutes?.id ?? null}
        rowVersion={minutes?.row_version ?? null}
        canEdit={canRemove}
      />

      <ActionItems
        meetingId={id}
        items={items.map((i) => ({
          id: i.id,
          title: i.title,
          owner_id: i.owner_id,
          due_date: i.due_date,
          status: i.status,
          source_task_id: i.source_task_id,
          row_version: i.row_version,
        }))}
        people={people}
        openTasks={openTasks}
        canDelete={canRemove}
      />

      {/* Last, and apart: it is the one thing on this page that cannot be
          undone, so it does not sit next to the things people press often. */}
      {canRemove && (
        <div className="pt-4 border-t border-gray-100">
          <DeleteMeeting meetingId={id} rowVersion={meeting.row_version} />
        </div>
      )}
    </div>
  );
}
