import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, hasManagerRights } from '@/lib/auth-guard';
import { getT } from '@/lib/ui/server-i18n';
import { weekKey } from '@/lib/week';
import { effectiveTopicOrder, topicsForWeek } from '@/lib/presentation-order';
import OrderBoard from './order-board';
import type { TopicRecord, UserRecord, WeekLeadRecord } from '@/lib/db/schema';
import { actsAsWeekLead } from '@/lib/rotation';

export default async function PresentationsPage(props: {
  searchParams: Promise<{ week?: string }>;
}) {
  const { week } = await props.searchParams;
  const [actor, users, allTopics, leads, t] = await Promise.all([
    requireSession(),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<TopicRecord>('topics'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    getT(),
  ]);

  const activeWeek = /^\d{4}-W\d{2}$/.test(week ?? '') ? (week as string) : weekKey();
  const { ordered, custom } = effectiveTopicOrder(topicsForWeek(allTopics, activeWeek));
  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? t('common.deletedUser');

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
        canArrange={hasManagerRights(actor.role) || actsAsWeekLead(actor, leads, activeWeek)}
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
