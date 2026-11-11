import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/lib/ui/page-header';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { weekKey } from '@/lib/week';
import { episodesOf, seriesColor } from '@/lib/clips';
import { loadClips } from '../../load';
import { chipFor, peopleOf, weekLabel } from '../../describe';
import { Chip, More, NotReady, PeopleLine, Swatch } from '../../clip-ui';
import { EpisodeAdd, SeriesEditor } from '../../clip-forms';

/**
 * One clip topic, read like a course outline: its episodes in order, each
 * with its week and who plans and makes it. One main action, adding an
 * episode; editing or deleting the topic waits under "more". Everybody may
 * manage it (D22); deleting the series is admin's.
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
  const episodes = episodesOf(series.id, data.clips);

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
          series.description ? <p className="whitespace-pre-line break-words text-gray-700">{series.description}</p> : undefined
        }
      />

      {episodes.length === 0 ? (
        <p className="p-6 text-center text-sm text-gray-500 bg-gray-50 rounded-xl border border-gray-100">
          {t('clips.series.noEpisodes')}
        </p>
      ) : (
        <ol className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
          {episodes.map((c) => {
            const chip = chipFor(c);
            const people = peopleOf(c, data, t, locale);
            return (
              <li key={c.id}>
                <Link
                  href={`/clips/episode/${c.id}`}
                  className={`tap-exempt flex items-start gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 ${c.week_key === today ? 'bg-blue-50' : ''}`}
                >
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block text-sm text-gray-500 tabular-nums">
                      {t('clips.episode.no', { n: Number(c.episode_no) })}
                      {' · '}
                      {c.week_key ? weekLabel(c.week_key, locale) : t('clips.series.noWeek')}
                    </span>
                    <span className="block font-medium text-gray-900 break-words">{c.title}</span>
                    {c.week_key && (
                      <PeopleLine
                        planLabel={t('clips.people.planShort')}
                        makeLabel={t('clips.people.makeShort')}
                        planner={people.planner}
                        maker={people.maker}
                        same={people.same}
                        sameLabel={t('clips.people.samePerson')}
                      />
                    )}
                  </span>
                  <Chip label={t(chip.label)} style={chip.style} />
                </Link>
              </li>
            );
          })}
        </ol>
      )}

      <EpisodeAdd seriesId={series.id} />

      <More label={t('clips.series.more')}>
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
      </More>
    </div>
  );
}
