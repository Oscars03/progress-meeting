import Link from 'next/link';
import InfoTip from '@/lib/ui/info-tip';
import PageHeader from '@/lib/ui/page-header';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { formatLabTime } from '@/lib/lab-time';
import { breakForWeek } from '@/lib/term-breaks';
import { weekKey } from '@/lib/week';
import type { ClipSeriesRecord } from '@/lib/db/schema';
import { canonicalForWeek, catalogueOrder, clipMaker, dueAt, isLate, seriesColor, seriesSummary, statusOf } from '@/lib/clips';
import { loadClips, type ClipData } from './load';
import { chipFor, describeMaker, peopleOf, weekLabel } from './describe';
import { Chip, ModeSwitch, More, NotReady, PeopleLine, Swatch } from './clip-ui';
import { NewTopic } from './clip-forms';

type T = Awaited<ReturnType<typeof getT>>;

/**
 * Where the menu opens (D21). Two things, in the order people need them:
 *
 * 1. this week's clip -- what it is, who makes it, who plans it, when it is
 *    due -- one tap from its page;
 * 2. the topic catalogue, one line per active topic with its next episode.
 *    Finished and archived topics fold away at the bottom.
 *
 * Read-only on load: everything is worked out from what was read, and nothing
 * is written until somebody presses a button.
 */
export default async function ClipsPage() {
  const [, t, locale, data] = await Promise.all([requirePageSession(), getT(), getLocale(), loadClips()]);

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
  const active = data.series.filter((s) => s.status === 'active' || !s.status);
  const done = data.series.filter((s) => s.status === 'finished' || s.status === 'archived');
  const byNext = (list: ClipSeriesRecord[]) =>
    catalogueOrder(list, data.clips, today).map((s) => ({ s, sum: seriesSummary(s.id, data.clips, today) }));

  return (
    <div className="space-y-5">
      {header}

      <ThisWeek data={data} today={today} t={t} locale={locale} />

      <section className="space-y-3">
        <h3 className="font-semibold text-gray-900">{t('clips.topics.heading')}</h3>
        <NewTopic />
        {active.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500 bg-gray-50 rounded-xl border border-gray-100">
            {t(data.series.length === 0 ? 'clips.empty.none' : 'clips.empty.noActive')}
          </p>
        ) : (
          <TopicList items={byNext(active)} data={data} t={t} locale={locale} />
        )}
      </section>

      {done.length > 0 && (
        <More label={t('clips.topics.done', { n: done.length })}>
          <TopicList items={byNext(done)} data={data} t={t} locale={locale} />
        </More>
      )}
    </div>
  );
}

/** This week's slot: the episode in it, or who would make one if it is empty. */
function ThisWeek({ data, today, t, locale }: { data: ClipData; today: string; t: T; locale: string }) {
  const clip = canonicalForWeek(data.clips, today);
  const brk = breakForWeek(data.breaks, today);
  const label = `${t('clips.week.thisWeek')} · ${weekLabel(today, locale)}`;
  const box = 'block p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 space-y-1';

  if (!clip) {
    const maker = describeMaker(clipMaker({ week_key: today }, data.leads, data.users, data.breaks), data.users, t, locale);
    return (
      <section className={box}>
        <p className="text-sm text-gray-500">{label}</p>
        {brk ? (
          <p className="text-gray-700">{t('clips.calendar.break', { name: brk.name })}</p>
        ) : (
          <>
            <p className="font-medium text-gray-900">{t('clips.week.empty')}</p>
            <p className="text-sm text-gray-600">
              {t('clips.people.maker')}: {maker.name ? `${maker.name}${maker.tentative ? '?' : ''}` : maker.note}
            </p>
            <p className="text-sm text-gray-500">{t('clips.week.emptyHelp')}</p>
          </>
        )}
      </section>
    );
  }

  const series = data.series.find((s) => s.id === clip.series_id);
  const chip = chipFor(clip);
  const people = peopleOf(clip, data, t, locale);
  const due = dueAt(clip);
  const late = isLate(clip);
  return (
    <Link href={`/clips/episode/${clip.id}`} className={`tap-exempt ${box} hover:bg-gray-50`}>
      <span className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-gray-500">{label}</span>
        <Chip label={t(chip.label)} style={chip.style} />
      </span>
      <span className="flex items-center gap-2 font-semibold text-gray-900 break-words">
        {series && <Swatch color={seriesColor(series)} />}
        {clip.title}
      </span>
      {series && (
        <span className="block text-sm text-gray-500 break-words">
          {series.title} · {t('clips.episode.no', { n: Number(clip.episode_no) })}
        </span>
      )}
      <PeopleLine
        planLabel={t('clips.people.planShort')}
        makeLabel={t('clips.people.makeShort')}
        planner={people.planner}
        maker={people.maker}
        same={people.same}
        sameLabel={t('clips.people.samePerson')}
      />
      {due && !['published', 'skipped'].includes(statusOf(clip)) && (
        <span className={`block text-sm ${late ? 'text-red-700' : 'text-gray-500'}`}>
          {t(late ? 'clips.week.lateDue' : 'clips.week.due', { when: formatLabTime(due, locale) })}
        </span>
      )}
    </Link>
  );
}

function TopicList({
  items,
  data,
  t,
  locale,
}: {
  items: { s: ClipSeriesRecord; sum: ReturnType<typeof seriesSummary> }[];
  data: ClipData;
  t: T;
  locale: string;
}) {
  return (
    <ul className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
      {items.map(({ s, sum }) => {
        const people = sum.next ? peopleOf(sum.next, data, t, locale) : null;
        return (
          <li key={s.id}>
            <Link href={`/clips/series/${s.id}`} className="tap-exempt flex items-start gap-3 px-4 sm:px-5 py-3.5 hover:bg-gray-50">
              <span className="pt-1.5">
                <Swatch color={seriesColor(s)} large />
              </span>
              <span className="min-w-0 flex-1 space-y-0.5">
                <span className="block font-semibold text-gray-900 break-words">{s.title}</span>
                <span className="block text-sm text-gray-500">
                  {t('clips.card.counts', { n: sum.episodes, published: sum.published })}
                  {sum.queued > 0 && ` · ${t('clips.card.queued', { n: sum.queued })}`}
                </span>
                {sum.next && people && (
                  <span className="block text-sm">
                    <span className="block text-gray-700">
                      {t('clips.card.next', { ep: Number(sum.next.episode_no), week: weekLabel(sum.next.week_key, locale) })}
                    </span>
                    <PeopleLine
                      planLabel={t('clips.people.planShort')}
                      makeLabel={t('clips.people.makeShort')}
                      planner={people.planner}
                      maker={people.maker}
                      same={people.same}
                      sameLabel={t('clips.people.samePerson')}
                    />
                  </span>
                )}
              </span>
              <svg aria-hidden="true" className="w-4 h-4 mt-1 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
