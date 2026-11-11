import Link from 'next/link';
import InfoTip from '@/lib/ui/info-tip';
import PageHeader from '@/lib/ui/page-header';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { weekKey } from '@/lib/week';
import { bookableWeeks, catalogueOrder, seriesColor, seriesSummary } from '@/lib/clips';
import { loadClips } from './load';
import { nameFrom, peopleOf, weekLabel, weekOptions } from './describe';
import { Chip, ModeSwitch, NotReady, PeopleLine, Swatch } from './clip-ui';
import { NewTopic } from './clip-forms';

const FILTERS = ['active', 'finished', 'all'] as const;
type Filter = (typeof FILTERS)[number];

/**
 * Page 1 of the weekly clips: the topic catalogue (D21 -- this is where the
 * menu opens). One card per series, with its episodes counted and the next
 * one's week, planner and maker.
 *
 * Read-only on load: the counts and the maker are worked out from what was
 * read, and nothing is written until somebody presses a button.
 */
export default async function ClipsPage(props: { searchParams: Promise<{ show?: string }> }) {
  const [, t, locale, data, params] = await Promise.all([
    requirePageSession(),
    getT(),
    getLocale(),
    loadClips(),
    props.searchParams,
  ]);
  const show: Filter = (FILTERS as readonly string[]).includes(params.show ?? '') ? (params.show as Filter) : 'active';

  const header = (
    <>
      <PageHeader title={t('nav.clips')} aside={<InfoTip>{t('clips.hint')}</InfoTip>} />
      <ModeSwitch active="topics" topicsLabel={t('clips.mode.topics')} calendarLabel={t('clips.mode.calendar')} />
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

  const today = weekKey();
  const taken = new Set(data.clips.map((c) => c.week_key).filter(Boolean));
  const freeWeeks = weekOptions(
    bookableWeeks(data.breaks, today).filter((k) => !taken.has(k)),
    locale
  );
  const name = nameFrom(data.users, t);

  const ordered = catalogueOrder(data.series, data.clips, today).filter((s) =>
    show === 'all' ? true : show === 'finished' ? s.status === 'finished' : s.status === 'active' || !s.status
  );

  return (
    <div className="space-y-4">
      {header}
      <NewTopic freeWeeks={freeWeeks} />

      <nav className="flex flex-wrap gap-2" aria-label={t('clips.filter.label')}>
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === 'active' ? '/clips' : `/clips?show=${f}`}
            aria-current={show === f ? 'page' : undefined}
            className={`btn btn-sm ${show === f ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t(`clips.filter.${f}`)}
          </Link>
        ))}
      </nav>

      {ordered.length === 0 ? (
        <div className="p-6 text-center bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-gray-500">
            {data.series.length === 0 ? t('clips.empty.none') : t('clips.empty.filter')}
          </p>
        </div>
      ) : (
        <ul className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
          {ordered.map((s) => {
            const sum = seriesSummary(s.id, data.clips, today);
            const people = sum.next ? peopleOf(sum.next, data, t, locale) : null;
            return (
              <li key={s.id}>
                <Link
                  href={`/clips/series/${s.id}`}
                  className="tap-exempt flex items-start gap-3 px-4 sm:px-5 py-3.5 hover:bg-gray-50"
                >
                  <span className="pt-1.5">
                    <Swatch color={seriesColor(s)} large />
                  </span>
                  <span className="min-w-0 flex-1 space-y-1">
                    <span className="block font-semibold text-gray-900 break-words">{s.title}</span>
                    <span className="block text-sm text-gray-500">
                      {t('clips.card.by', { name: name(s.created_by), n: sum.episodes })}
                      {s.status === 'finished' && ` · ${t('clips.seriesStatus.finished')}`}
                      {s.status === 'archived' && ` · ${t('clips.seriesStatus.archived')}`}
                    </span>
                    {sum.episodes > 0 && (
                      <span className="flex flex-wrap gap-1.5">
                        {sum.published > 0 && (
                          <Chip label={t('clips.count.published', { n: sum.published })} style="bg-green-50 text-green-700" />
                        )}
                        {sum.inProgress > 0 && (
                          <Chip label={t('clips.count.inProgress', { n: sum.inProgress })} style="bg-blue-50 text-blue-700" />
                        )}
                        {sum.planned > 0 && (
                          <Chip label={t('clips.count.planned', { n: sum.planned })} style="bg-gray-100 text-gray-700" />
                        )}
                        {sum.queued > 0 && (
                          <Chip label={t('clips.count.queued', { n: sum.queued })} style="bg-amber-50 text-amber-800" />
                        )}
                      </span>
                    )}
                    {sum.next && people ? (
                      <span className="block text-sm">
                        <span className="text-gray-700">
                          {t('clips.card.next', {
                            ep: Number(sum.next.episode_no),
                            week: weekLabel(sum.next.week_key, locale),
                          })}
                        </span>
                        <br />
                        <PeopleLine
                          planLabel={t('clips.people.planShort')}
                          makeLabel={t('clips.people.makeShort')}
                          planner={people.planner}
                          maker={people.maker}
                          same={people.same}
                          sameLabel={t('clips.people.samePerson')}
                        />
                      </span>
                    ) : (
                      s.status === 'active' &&
                      sum.episodes > 0 && <span className="block text-sm text-gray-500">{t('clips.card.nothingBooked')}</span>
                    )}
                  </span>
                  <svg aria-hidden="true" className="w-4 h-4 mt-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
