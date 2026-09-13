import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, hasManagerRights } from '@/lib/auth-guard';
import type {
  ActionItemRecord,
  MeetingRecord,
  MinutesRecord,
  TaskRecord,
  UserRecord,
} from '@/lib/db/schema';
import { rotationMembers, suggestNextHost } from '@/lib/rotation';
import HostPicker from '../../dashboard/host-picker';
import MinutesEditor from './minutes-editor';
import ActionItems from './action-items';
import CalendarSync from './calendar-sync';
import { getT } from '@/lib/ui/server-i18n';

export default async function MeetingDetailPage(props: PageProps<'/meetings/[id]'>) {
  const { id } = await props.params;
  const [actor, t] = await Promise.all([requireSession(), getT()]);

  const meetings = await SheetRepo.find<MeetingRecord>('meetings');
  const meeting = meetings.find((m) => m.id === id);
  if (!meeting) notFound();

  const [users, allMinutes, allItems, tasks] = await Promise.all([
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MinutesRecord>('minutes'),
    SheetRepo.find<ActionItemRecord>('action_items'),
    SheetRepo.find<TaskRecord>('tasks'),
  ]);

  const people = users
    .filter((u) => u.active === true)
    .map((u) => ({ id: u.id, name: u.name }));

  const minutes = allMinutes.find((m) => m.meeting_id === id) ?? null;
  const items = allItems.filter((i) => i.meeting_id === id);

  // Only unfinished tasks are worth linking a follow-up to.
  const openTasks = tasks
    .filter((t) => t.status !== 'done')
    .map((t) => ({ id: t.id, title: t.title }));

  const canManage = hasManagerRights(actor.role);
  const students = rotationMembers(users);
  const hostName = meeting.host_id ? (users.find((u) => u.id === meeting.host_id)?.name ?? '') : '';
  const suggestedHost = hostName ? null : suggestNextHost(users, meetings);
  const calendarOwner = users.find((u) => u.id === meeting.google_calendar_owner_id);
  const when = [meeting.start_at, meeting.end_at].filter(Boolean).join(' — ');

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <Link href="/meetings" className="text-sm text-blue-600 hover:underline">
          {t('polls.backToCalendar')}
        </Link>
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
              meeting.host_id ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-800'
            }`}
          >
            {meeting.host_id ? t('rotation.confirmed') : t('rotation.suggested')}
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
            {canManage && (
              <HostPicker
                meetingId={id}
                rowVersion={meeting.row_version}
                students={students.map((s) => ({ id: s.id, name: s.name }))}
                hostId={meeting.host_id ?? ''}
                suggestedId={suggestedHost?.id ?? ''}
              />
            )}
          </>
        )}
      </section>

      <CalendarSync
        meetingId={id}
        linked={Boolean(meeting.google_event_id)}
        syncedAt={meeting.google_synced_at ?? ''}
        ownerName={calendarOwner?.name ?? t('meeting.eventCreator')}
      />

      <MinutesEditor
        meetingId={id}
        initialContent={minutes?.content ?? ''}
        minutesId={minutes?.id ?? null}
        rowVersion={minutes?.row_version ?? null}
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
        canDelete={canManage}
      />
    </div>
  );
}
