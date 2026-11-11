import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/lib/ui/page-header';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { weekKey } from '@/lib/week';
import {
  bookableWeeks,
  episodesOf,
  nextFreeWeek,
  seriesColor,
  seriesStartWeek,
  statusOf,
} from '@/lib/clips';
import { loadClips } from '../../load';
import { chipFor, nameFrom, peopleOf, weekLabel, weekOptions } from '../../describe';
import { Chip, NotReady, PeopleLine, Swatch } from '../../clip-ui';
import { EpisodeAdd, QueueBooking, SeriesEditor } from '../../clip-forms';

/**
 * One series: its episodes in order with their weeks, planner and maker, and
 * the queue of episodes not yet given a week. Everybody may manage it (D22);
 * deleting the series is admin's.
 */
export default async function SeriesPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const [actor, t, locale, data] = await Promise.all([requirePageSession(), getT(), getLocale(), loadClips()]);

  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader back="/clips" title={t('nav.clips')} />
        <NotReady title={t('clips.notReady.title')} body={t('clips.notReady.body')} />
      </div>
    );
  }

  const series = data.series.find((s) => s.id === id);
  if (!series) notFound();

  const today = weekKey();
  const name = nameFrom(data.users, t);
  const episodes = episodesOf(series.id, data.clips);
  const booked = episodes
    .filter((c) => c.week_key || statusOf(c) !== 'planned')
    .sort((a, b) => (a.week_key || '￿').localeCompare(b.week_key || '￿') || Number(a.episode_no) - Number(b.episode_no));
  const queued = episodes.filter((c) => !c.week_key && statusOf(c) === 'planned');

  const taken = new Set(data.clips.map((c) => c.week_key).filter(Boolean));
  const free = bookableWeeks(data.breaks, today).filter((k) => !taken.has(k));
  const freeWeeks = weekOptions(free, locale);

  return (
    <div className="space-y-5">
      <PageHeader
        back="/clips"
        title={
          <span className="inline-flex items-center gap-2 break-words">
            <Swatch color={seriesColor(series)} large />
            {series.title}
          </span>
        }
        description={
          <>
            <p>{t('clips.series.keeper', { name: name(series.created_by), n: episodes.length })}</p>
            {series.description && <p className="whitespace-pre-line break-words text-gray-700">{series.description}</p>}
          </>
        }
      />

      <SeriesEditor
        series={{
          id: series.id,
          title: series.title,
          description: series.description,
          color: series.color,
          status: series.status,
          rowVersion: series.row_version,
        }}
        isAdmin={actor.role === 'admin'}
        episodeCount={episodes.length}
      />

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-500">{t('clips.series.scheduled', { n: booked.length })}</h3>
        {booked.length === 0 ? (
          <p className="text-sm text-gray-500">{t('clips.series.noneScheduled')}</p>
        ) : (
          <ol className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
            {booked.map((c) => {
              const chip = chipFor(c);
              const people = peopleOf(c, data, t, locale);
              return (
                <li key={c.id}>
                  <Link
                    href={`/clips/episode/${c.id}`}
                    className="tap-exempt flex flex-wrap items-start gap-x-3 gap-y-1 px-4 sm:px-5 py-3 hover:bg-gray-50"
                  >
                    <span className="min-w-0 flex-1 basis-56 space-y-0.5">
                      <span className="block text-sm text-gray-500 tabular-nums">
                        {t('clips.episode.no', { n: Number(c.episode_no) })}
                        {' · '}
                        {c.week_key ? weekLabel(c.week_key, locale) : t('clips.status.queued')}
                      </span>
                      <span className="block font-medium text-gray-900 break-words">{c.title}</span>
                      <PeopleLine
                        planLabel={t('clips.people.planShort')}
                        makeLabel={t('clips.people.makeShort')}
                        planner={people.planner}
                        maker={people.maker}
                        same={people.same}
                        sameLabel={t('clips.people.samePerson')}
                      />
                    </span>
                    <Chip label={t(chip.label)} style={chip.style} />
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-500">{t('clips.series.queue', { n: queued.length })}</h3>
        {queued.length === 0 ? (
          <p className="text-sm text-gray-500">{t('clips.series.queueEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {queued.map((c) => {
              const next = nextFreeWeek(data.clips, data.breaks, seriesStartWeek(data.clips, c, today), today);
              return (
                <li key={c.id} className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 space-y-2">
                  <Link href={`/clips/episode/${c.id}`} className="tap-exempt block hover:underline">
                    <span className="text-sm text-gray-500">{t('clips.episode.no', { n: Number(c.episode_no) })}</span>{' '}
                    <span className="font-medium text-gray-900 break-words">{c.title}</span>
                  </Link>
                  <QueueBooking
                    clipId={c.id}
                    rowVersion={c.row_version}
                    nextFree={next ? { key: next, label: weekLabel(next, locale) } : null}
                    freeWeeks={freeWeeks}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <EpisodeAdd seriesId={series.id} />
    </div>
  );
}
