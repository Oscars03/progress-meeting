import Link from 'next/link';
import PageHeader from '@/lib/ui/page-header';
import InfoTip from '@/lib/ui/info-tip';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { breakForWeek } from '@/lib/term-breaks';
import { weekRange } from '@/lib/meeting-history';
import { isMonthKey, monthOfWeek, shiftMonth, weekKey, weeksOfMonth } from '@/lib/week';
import { canonicalForWeek, clashingIds, clipMaker, seriesColor } from '@/lib/clips';
import { loadClips } from '../load';
import { chipFor, describeMaker, peopleOf } from '../describe';
import { Chip, ModeSwitch, NotReady, PeopleLine, Swatch } from '../clip-ui';

/**
 * Page 2 of the weekly clips: the calendar summary, one slot per week.
 *
 * This is the agenda list -- one row per week, a week spanning two months
 * listed in the month of its Thursday so nothing shows twice. Rendered on the
 * server from plain links; the wide month grid comes later.
 */
export default async function ClipsCalendarPage(props: { searchParams: Promise<{ month?: string }> }) {
  const [, t, locale, data, params] = await Promise.all([
    requirePageSession(),
    getT(),
    getLocale(),
    loadClips(),
    props.searchParams,
  ]);

  const today = weekKey();
  const month = isMonthKey(params.month) ? params.month : (monthOfWeek(today) ?? new Date().toISOString().slice(0, 7));
  const monthTitle = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const header = (
    <>
      <PageHeader title={t('nav.clips')} aside={<InfoTip>{t('clips.calendar.hint')}</InfoTip>} />
      <ModeSwitch active="calendar" topicsLabel={t('clips.mode.topics')} calendarLabel={t('clips.mode.calendar')} />
    </>
  );

  if (!data) {
    return (
      <div className="space-y-4">
        {header}
        <NotReady title={t('clips.notReady.title')} body={t('clips.notReady.body')} />
      </div>
    );
  }

  const clashes = clashingIds(data.clips);
  const weeks = weeksOfMonth(month);

  return (
    <div className="space-y-4">
      {header}

      <div className="flex items-center justify-between gap-2">
        <Link href={`/clips/calendar?month=${shiftMonth(month, -1)}`} className="btn btn-ghost btn-sm" aria-label={t('clips.calendar.prev')}>
          ‹
        </Link>
        <h3 className="text-lg font-semibold text-gray-900">{monthTitle}</h3>
        <Link href={`/clips/calendar?month=${shiftMonth(month, 1)}`} className="btn btn-ghost btn-sm" aria-label={t('clips.calendar.next')}>
          ›
        </Link>
      </div>

      <ol className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
        {weeks.map((week) => {
          const brk = breakForWeek(data.breaks, week);
          const clip = canonicalForWeek(data.clips, week);
          const series = clip ? data.series.find((s) => s.id === clip.series_id) : undefined;
          const isNow = week === today;

          return (
            <li key={week} className={isNow ? 'bg-blue-50' : undefined}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 sm:px-5 py-3">
                <span className="w-28 shrink-0 text-sm tabular-nums">
                  <span className="block font-medium text-gray-900">
                    {week.replace(/^\d{4}-/, '')}
                    {isNow && <span className="ml-1 text-blue-700">★</span>}
                  </span>
                  <span className="block text-gray-500">{weekRange(week, locale)}</span>
                </span>

                <span className="min-w-0 flex-1 basis-48">
                  {brk ? (
                    <span className="text-sm text-gray-500">{t('clips.calendar.break', { name: brk.name })}</span>
                  ) : clip ? (
                    <Link href={`/clips/episode/${clip.id}`} className="tap-exempt block space-y-0.5 hover:underline">
                      <span className="flex flex-wrap items-center gap-2">
                        {series && <Swatch color={seriesColor(series)} />}
                        <span className="font-medium text-gray-900 break-words">
                          {series ? `${series.title} · ` : ''}
                          {t('clips.episode.no', { n: Number(clip.episode_no) })}
                        </span>
                        <Chip label={t(chipFor(clip).label)} style={chipFor(clip).style} />
                        {clashes.has(clip.id) && (
                          <Chip label={t('clips.calendar.clash')} style="bg-red-50 text-red-700" />
                        )}
                      </span>
                      <span className="block text-sm text-gray-700 break-words">{clip.title}</span>
                      {(() => {
                        const people = peopleOf(clip, data, t, locale);
                        return (
                          <PeopleLine
                            planLabel={t('clips.people.planShort')}
                            makeLabel={t('clips.people.makeShort')}
                            planner={people.planner}
                            maker={people.maker}
                            same={people.same}
                            sameLabel={t('clips.people.samePerson')}
                          />
                        );
                      })()}
                    </Link>
                  ) : (
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-gray-500">{t('clips.calendar.empty')}</span>
                      <span className="text-gray-600">
                        {t('clips.people.makeShort')}: {(() => {
                          const m = describeMaker(clipMaker({ week_key: week }, data.leads, data.users, data.breaks), data.users, t, locale);
                          return m.name ? `${m.name}${m.tentative ? '?' : ''}` : '—';
                        })()}
                      </span>
                      {week >= today && (
                        <Link href={`/clips/week/${week}`} className="btn btn-secondary btn-sm">
                          {t('clips.calendar.add')}
                        </Link>
                      )}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
