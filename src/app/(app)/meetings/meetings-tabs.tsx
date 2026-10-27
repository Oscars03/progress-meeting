import Link from 'next/link';
import { getT } from '@/lib/ui/server-i18n';

/**
 * The meeting page's two halves: the calendar, for what is coming, and the
 * weekly history, for what has been.
 *
 * They were in different places -- the history sat under the presentations
 * page as "past meetings", where nobody looking for last week's minutes
 * would think to look. Two links that look like tabs, not a client-side
 * switch: each half is its own page, so a link to the history stays a link
 * to the history.
 */
export default async function MeetingsTabs({ current }: { current: 'calendar' | 'history' }) {
  const t = await getT();
  const tabs = [
    { key: 'calendar', href: '/meetings', label: t('history.tabCalendar') },
    { key: 'history', href: '/meetings/history', label: t('history.tabHistory') },
  ] as const;

  return (
    <nav aria-label={t('history.tabsLabel')}>
      <ul className="flex gap-1 border-b border-gray-200">
        {tabs.map((tab) => {
          const active = tab.key === current;
          return (
            <li key={tab.key}>
              <Link
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px inline-flex px-3 py-2 text-sm border-b-2 ${
                  active
                    ? 'border-blue-600 text-blue-700 font-semibold'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
