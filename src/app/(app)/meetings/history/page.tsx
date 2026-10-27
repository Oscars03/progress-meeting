import Link from 'next/link';
import PageHeader from '@/lib/ui/page-header';
import InfoTip from '@/lib/ui/info-tip';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { weekRange } from '@/lib/meeting-history';
import MeetingsTabs from '../meetings-tabs';
import { loadHistory } from './load';

/**
 * Every finished week, newest first, one row each.
 *
 * A row says enough to find the week you want -- when it was, who led it,
 * how much it holds -- and no more; the week itself opens on its own page.
 * The old history put every week's topics and minutes on one long page, and
 * finding last month meant scrolling past everything since.
 */
export default async function MeetingHistoryPage() {
  const [, t, locale, { weeks, nameOf }] = await Promise.all([
    requirePageSession(),
    getT(),
    getLocale(),
    loadHistory(),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title={t('history.tabHistory')} aside={<InfoTip>{t('history.listHint')}</InfoTip>} />
      <MeetingsTabs current="history" />

      {weeks.length === 0 ? (
        <div className="p-6 text-center bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-gray-500">{t('history.empty')}</p>
        </div>
      ) : (
        <ol className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
          {weeks.map((week) => {
            const items = week.meetings.reduce((n, m) => n + m.items.length, 0);
            const written = week.meetings.some((m) => m.minutes?.content);
            return (
              <li key={week.weekKey}>
                <Link
                  href={`/meetings/history/${week.weekKey}`}
                  className="tap-exempt flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 sm:px-5 py-3.5 hover:bg-gray-50"
                >
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block font-semibold text-gray-900">{weekRange(week.weekKey, locale)}</span>
                    <span className="block text-sm text-gray-500">
                      <span className="tabular-nums">{t('history.week', { week: week.weekKey })}</span>
                      {' · '}
                      {week.leadId
                        ? t('history.lead', { name: nameOf(week.leadId) ?? t('common.deletedUser') })
                        : t('history.noLead')}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {t('history.topicCount', { n: week.topics.length })}
                    </span>
                    {week.meetings.length > 0 && (
                      <span
                        className={`px-2 py-0.5 rounded-full ${
                          written ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {written ? t('history.hasMinutes') : t('history.noMinutes')}
                      </span>
                    )}
                    {items > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                        {t('history.itemCount', { n: items })}
                      </span>
                    )}
                  </span>
                  <svg aria-hidden="true" className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
