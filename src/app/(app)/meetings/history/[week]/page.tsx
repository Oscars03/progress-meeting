import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/lib/ui/page-header';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { formatLabTime } from '@/lib/lab-time';
import { weekRange } from '@/lib/meeting-history';
import { loadHistory } from '../load';

const ITEM_STATUS = {
  open: 'items.status.open',
  done: 'items.status.done',
  dropped: 'items.status.dropped',
} as const;

/**
 * One finished week, everything it left behind, each part in its own card:
 * who led it, what was presented, and for each meeting the minutes and the
 * work it handed out.
 *
 * Read-only on purpose: a past week is a record. Admin gets a way into the
 * week's running order to correct it; the meeting itself is a link away for
 * whoever may change it there.
 */
export default async function HistoryWeekPage(props: { params: Promise<{ week: string }> }) {
  const { week: key } = await props.params;
  const [actor, t, locale, { weeks, nameOf }] = await Promise.all([
    requirePageSession(),
    getT(),
    getLocale(),
    loadHistory(),
  ]);

  const week = weeks.find((w) => w.weekKey === key);
  if (!week) notFound();
  const name = (id: string) => nameOf(id) ?? t('common.deletedUser');
  const card = 'p-5 sm:p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3';

  return (
    <div className="space-y-6">
      <PageHeader
        back="/meetings/history"
        title={weekRange(week.weekKey, locale)}
        aside={<span className="text-sm text-gray-500 tabular-nums">{t('history.week', { week: week.weekKey })}</span>}
        actions={
          actor.role === 'admin' && (
            <Link href={`/presentations?week=${week.weekKey}`} className="btn btn-secondary btn-sm">
              {t('history.edit')}
            </Link>
          )
        }
      />

      <section className={card}>
        <h3 className="text-lg font-semibold text-gray-900">{t('rotation.title')}</h3>
        <p className="text-base font-semibold text-gray-900">
          {week.leadId ? name(week.leadId) : <span className="font-normal text-gray-500">{t('history.noLead')}</span>}
        </p>
      </section>

      <section className={card}>
        <h3 className="text-lg font-semibold text-gray-900">{t('history.topics')}</h3>
        {week.topics.length === 0 ? (
          <p className="text-sm text-gray-500">{t('history.noTopics')}</p>
        ) : (
          <ol className="space-y-2 list-decimal pl-5 marker:text-gray-500">
            {week.topics.map((topic) => (
              <li key={topic.id} className="text-sm">
                <span className="font-medium text-gray-900 break-words">{topic.title}</span>
                <span className="text-gray-500"> — {name(topic.owner_id)}</span>
                {topic.details && (
                  <p className="text-gray-600 mt-0.5 whitespace-pre-line break-words">{topic.details}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {week.meetings.length === 0 ? (
        <section className={card}>
          <h3 className="text-lg font-semibold text-gray-900">{t('history.meetings')}</h3>
          <p className="text-sm text-gray-500">{t('history.noMeeting')}</p>
        </section>
      ) : (
        week.meetings.map(({ meeting, minutes, items }) => (
          <section key={meeting.id} className={card}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-lg font-semibold text-gray-900">{meeting.title}</h3>
              <span className="text-sm text-gray-500 tabular-nums">
                {formatLabTime(meeting.start_at, locale) || t('meeting.noTime')}
              </span>
              <Link href={`/meetings/${meeting.id}`} className="btn btn-secondary btn-sm ml-auto">
                {t('history.openMeeting')}
              </Link>
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-500">{t('minutes.title')}</h4>
              {minutes?.content ? (
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-line break-words">{minutes.content}</p>
              ) : (
                <p className="mt-1 text-sm text-gray-500">{t('minutes.noneYet')}</p>
              )}
            </div>

            <div>
              <h4 className="text-sm font-medium text-gray-500">{t('history.items')}</h4>
              {items.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">{t('history.noItems')}</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          item.status === 'done'
                            ? 'bg-green-50 text-green-700'
                            : item.status === 'dropped'
                              ? 'bg-gray-100 text-gray-500'
                              : 'bg-amber-50 text-amber-800'
                        }`}
                      >
                        {t(ITEM_STATUS[item.status as keyof typeof ITEM_STATUS] ?? 'items.status.open')}
                      </span>
                      <span className="text-gray-900 break-words">{item.title}</span>
                      {item.owner_id && <span className="text-gray-500">— {name(item.owner_id)}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
