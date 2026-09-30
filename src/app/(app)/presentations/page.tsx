import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession, canAddTopic, canEditAnyTopic } from '@/lib/auth-guard';
import { getT } from '@/lib/ui/server-i18n';
import { effectiveTopicOrder, topicsForWeek, lastArrangedBy } from '@/lib/presentation-order';
import OrderBoard from './order-board';
import type {
  AuditRecord,
  MeetingRecord,
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

export default async function PresentationsPage(props: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await props.searchParams;
  const [actor, users, meetings, allTopics, initialLeads, breaks, t] = await Promise.all([
    requirePageSession(),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MeetingRecord>('meetings'),
    SheetRepo.find<TopicRecord>('topics'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    SheetRepo.find<TermBreakRecord>('term_breaks').catch(() => []),
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

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold text-gray-900">{t('presentations.title')}</h2>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 tabular-nums">
              {t('presentations.week', { week: activeWeek })}
            </span>
            <Link href="/presentations/history" className="text-sm text-blue-600 hover:underline">
              {t('history.link')}
            </Link>
          </div>
        </div>
        {locked && <p className="text-sm text-gray-500">{t('presentations.pastWeek')}</p>}
        {currentBreak && (
          <p className="text-sm text-gray-500">
            {t('presentations.afterBreak', { name: currentBreak.name })}
          </p>
        )}
      </div>

      <OrderBoard
        weekKey={activeWeek}
        custom={custom}
        canArrange={!locked && (can(actor, 'arrangeOrder') || actsAsWeekLead(actor, leads, activeWeek))}
        canAdd={!locked && canAddTopic(actor)}
        canEditAny={!locked && canEditAnyTopic(actor)}
        readOnly={locked}
        arrangedBy={arrangedById ? nameOf(arrangedById) : null}
        currentUserId={actor.id}
        topics={ordered.map((topic) => ({
          id: topic.id,
          title: topic.title,
          details: topic.details,
          owner_id: topic.owner_id,
          owner_name: nameOf(topic.owner_id),
          row_version: topic.row_version,
        }))}
      />
    </div>
  );
}
