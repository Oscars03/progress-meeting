import PageHeader from '@/lib/ui/page-header';
import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession, canAddTopic, canEditAnyTopic } from '@/lib/auth-guard';
import { getT } from '@/lib/ui/server-i18n';
import { effectiveTopicOrder, topicsForWeek, lastArrangedBy } from '@/lib/presentation-order';
import OrderBoard from './order-board';
import type {
  AuditRecord,
  MeetingRecord,
  TaskRecord,
  TermBreakRecord,
  TopicRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';
import { activeWeekKey, actsAsWeekLead, agendaWeekKey } from '@/lib/rotation';
import { breakForWeek } from '@/lib/term-breaks';
import { autoAssignWeekLead } from '../meetings/actions';
import { can } from '@/lib/permissions';
import { isPastWeek } from '@/lib/meeting-history';
import { taskTitles } from '@/lib/task-title';
import { rollUpProgress } from '@/lib/tracker';
import { assigneesOf } from '../tasks/tracker-model';

export default async function PresentationsPage(props: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await props.searchParams;
  const [actor, users, meetings, allTopics, initialLeads, breaks, tasks, t] = await Promise.all([
    requirePageSession(),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MeetingRecord>('meetings'),
    SheetRepo.find<TopicRecord>('topics'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    SheetRepo.find<TermBreakRecord>('term_breaks').catch(() => []),
    SheetRepo.find<TaskRecord>('tasks').catch(() => [] as TaskRecord[]),
    getT(),
  ]);

  // In a term break this is the week the lab comes back to -- see agendaWeekKey.
  const rolledWeek = agendaWeekKey(meetings, breaks);
  const currentBreak = week ? null : breakForWeek(breaks, activeWeekKey(meetings));
  const assignedAutomatically = await autoAssignWeekLead(rolledWeek);
  const leads = assignedAutomatically ? await SheetRepo.find<WeekLeadRecord>('week_leads') : initialLeads;

  const activeWeek = /^\d{4}-W\d{2}$/.test(week ?? '') ? (week as string) : rolledWeek;
  const { ordered, custom } = effectiveTopicOrder(topicsForWeek(allTopics, activeWeek));
  // Opened from the history page, or by an old link. Everybody may read it;
  // only admin may still change it -- the actions refuse the rest regardless.
  const locked = isPastWeek(activeWeek, rolledWeek) && actor.role !== 'admin';
  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? t('common.deletedUser');

  // Only when the week was actually arranged. A suggested order has nobody to
  // name, and audit_log is the longest sheet here -- no reason to read it to
  // answer a question the badge has already answered.
  const arrangedById = custom
    ? lastArrangedBy(await SheetRepo.find<AuditRecord>('audit_log'), ordered)
    : null;

  // The work a topic can be picked from, and how far along each piece is --
  // a project with subtasks as their average, as the tracker shows it.
  const titleOf = taskTitles(tasks);
  const taskById = new Map(tasks.map((task) => [task.id, task] as const));
  const progressOf = (task: TaskRecord) =>
    rollUpProgress(
      tasks
        .filter((s) => s.parent_id === task.id)
        .map((s) => ({ status: s.status, progress: Number(s.progress_pct) || 0 }))
    ) ?? Math.round(Number(task.progress_pct) || 0);
  const linkOf = (topic: TopicRecord) => {
    const task = topic.task_id ? taskById.get(topic.task_id) : undefined;
    return task ? { id: task.id, title: titleOf(task), progress: progressOf(task) } : null;
  };
  // Your own unfinished work, and whatever this week's topics already point
  // at, so editing a topic about work since finished still shows its link.
  const linked = new Set(ordered.map((topic) => topic.task_id).filter(Boolean));
  const workOptions = tasks
    .filter(
      (task) =>
        linked.has(task.id) ||
        (task.status !== 'done' && (task.owner_id === actor.id || assigneesOf(task).includes(actor.id)))
    )
    .map((task) => ({ id: task.id, title: titleOf(task) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'th'));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('presentations.title')}
        aside={
          <span className="text-sm text-gray-500 tabular-nums">
            {t('presentations.week', { week: activeWeek })}
          </span>
        }
        actions={
          <Link href="/meetings/history" className="btn btn-secondary btn-sm">
            {t('history.link')}
          </Link>
        }
        description={
          (locked || currentBreak) && (
            <>
              {locked && <p>{t('presentations.pastWeek')}</p>}
              {currentBreak && <p>{t('presentations.afterBreak', { name: currentBreak.name })}</p>}
            </>
          )
        }
      />

      <OrderBoard
        weekKey={activeWeek}
        custom={custom}
        canArrange={!locked && (can(actor, 'arrangeOrder') || actsAsWeekLead(actor, leads, activeWeek))}
        canAdd={!locked && canAddTopic(actor)}
        canEditAny={!locked && canEditAnyTopic(actor)}
        readOnly={locked}
        arrangedBy={arrangedById ? nameOf(arrangedById) : null}
        currentUserId={actor.id}
        workOptions={workOptions}
        topics={ordered.map((topic) => ({
          id: topic.id,
          title: topic.title,
          details: topic.details,
          owner_id: topic.owner_id,
          owner_name: nameOf(topic.owner_id),
          row_version: topic.row_version,
          task: linkOf(topic),
        }))}
      />
    </div>
  );
}
