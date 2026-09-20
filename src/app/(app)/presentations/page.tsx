import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, canAddTopic, canEditAnyTopic } from '@/lib/auth-guard';
import { getT } from '@/lib/ui/server-i18n';
import { effectiveTopicOrder, topicsForWeek, lastArrangedBy } from '@/lib/presentation-order';
import OrderBoard from './order-board';
import type { AuditRecord, MeetingRecord, TopicRecord, UserRecord, WeekLeadRecord } from '@/lib/db/schema';
import { activeWeekKey, actsAsWeekLead } from '@/lib/rotation';
import { autoAssignWeekLead } from '../meetings/actions';
import { can } from '@/lib/permissions';

export default async function PresentationsPage(props: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await props.searchParams;
  const [actor, users, meetings, allTopics, initialLeads, t] = await Promise.all([
    requireSession(),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MeetingRecord>('meetings'),
    SheetRepo.find<TopicRecord>('topics'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    getT(),
  ]);

  const rolledWeek = activeWeekKey(meetings);
  const assignedAutomatically = await autoAssignWeekLead(rolledWeek);
  const leads = assignedAutomatically ? await SheetRepo.find<WeekLeadRecord>('week_leads') : initialLeads;

  const activeWeek = /^\d{4}-W\d{2}$/.test(week ?? '') ? (week as string) : rolledWeek;
  const { ordered, custom } = effectiveTopicOrder(topicsForWeek(allTopics, activeWeek));
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
          <span className="text-sm text-gray-500 tabular-nums">
            {t('presentations.week', { week: activeWeek })}
          </span>
        </div>
        <p className="text-sm text-gray-500">{t('presentations.subtitle')}</p>
      </div>

      <OrderBoard
        weekKey={activeWeek}
        custom={custom}
        canArrange={can(actor, 'arrangeOrder') || actsAsWeekLead(actor, leads, activeWeek)}
        canAdd={canAddTopic(actor)}
        canEditAny={canEditAnyTopic(actor)}
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
