import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession } from '@/lib/auth-guard';
import type {
  ActionItemRecord,
  MeetingAttendeeRecord,
  MeetingRecord,
  MinutesRecord,
  TaskRecord,
  UserRecord,
} from '@/lib/db/schema';
import MinutesEditor from './minutes-editor';
import ActionItems from './action-items';
import Agenda from './agenda';
import CalendarSync from './calendar-sync';
import { getT } from '@/lib/ui/server-i18n';

export default async function MeetingDetailPage(props: PageProps<'/meetings/[id]'>) {
  const { id } = await props.params;
  const [actor, t] = await Promise.all([requireSession(), getT()]);

  const meetings = await SheetRepo.find<MeetingRecord>('meetings');
  const meeting = meetings.find((m) => m.id === id);
  if (!meeting) notFound();

  const [users, allMinutes, allItems, allAttendees, tasks] = await Promise.all([
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MinutesRecord>('minutes'),
    SheetRepo.find<ActionItemRecord>('action_items'),
    SheetRepo.find<MeetingAttendeeRecord>('meeting_attendees'),
    SheetRepo.find<TaskRecord>('tasks'),
  ]);

  const people = users
    .filter((u) => u.active === true)
    .map((u) => ({ id: u.id, name: u.name }));

  const minutes = allMinutes.find((m) => m.meeting_id === id) ?? null;
  const items = allItems.filter((i) => i.meeting_id === id);

  const attendees = allAttendees
    .filter((a) => a.meeting_id === id && a.present_order !== '' && a.present_order !== undefined)
    .sort((a, b) => Number(a.present_order) - Number(b.present_order));

  // Only unfinished tasks are worth linking a follow-up to.
  const openTasks = tasks
    .filter((t) => t.status !== 'done')
    .map((t) => ({ id: t.id, title: t.title }));

  const canManage = actor.role === 'admin' || actor.role === 'manager';
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

      <Agenda
        meetingId={id}
        people={people}
        attendees={attendees.map((a) => ({
          id: a.id,
          user_id: a.user_id,
          attend_status: a.attend_status,
          present_order: Number(a.present_order),
          row_version: a.row_version,
        }))}
        canManage={canManage}
      />

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
