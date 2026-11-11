import { notFound, redirect } from 'next/navigation';
import PageHeader from '@/lib/ui/page-header';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { breakForWeek } from '@/lib/term-breaks';
import { weekRange } from '@/lib/meeting-history';
import { isRealWeekKey, weekKey } from '@/lib/week';
import { canonicalForWeek, clipMaker, episodesOf, statusOf, weekProblem } from '@/lib/clips';
import { loadClips } from '../../load';
import { describeMaker } from '../../describe';
import { NotReady } from '../../clip-ui';
import { BookIntoWeek, NewTopic } from '../../clip-forms';

const PROBLEM_KEY = {
  badWeek: 'clips.error.badWeek',
  breakWeek: 'clips.error.breakWeek',
  pastWeek: 'clips.error.pastWeek',
  beyondHorizon: 'clips.error.beyondHorizon',
  weekTaken: 'clips.error.weekTaken',
} as const;

/**
 * A week from the calendar. If an episode holds it, that episode's page;
 * otherwise this "empty week" page, saying who would make a clip for it and
 * offering to put a queued episode -- or a new one-off -- into it.
 */
export default async function ClipWeekPage(props: { params: Promise<{ week: string }> }) {
  const { week } = await props.params;
  if (!isRealWeekKey(week)) notFound();

  const [, t, locale, data] = await Promise.all([requirePageSession(), getT(), getLocale(), loadClips()]);

  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader back="/clips/calendar" title={t('nav.clips')} />
        <NotReady title={t('clips.notReady.title')} body={t('clips.notReady.body')} />
      </div>
    );
  }

  const holder = canonicalForWeek(data.clips, week);
  if (holder) redirect(`/clips/episode/${holder.id}`);

  const brk = breakForWeek(data.breaks, week);
  const maker = describeMaker(clipMaker({ week_key: week }, data.leads, data.users, data.breaks), data.users, t, locale);
  const problem = weekProblem(week, data.clips, data.breaks, null, weekKey());
  const card = 'p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3';

  const queued = data.series.flatMap((s) =>
    episodesOf(s.id, data.clips)
      .filter((c) => !c.week_key && statusOf(c) === 'planned')
      .map((c) => ({
        id: c.id,
        rowVersion: c.row_version,
        label: `${s.title} · ${t('clips.episode.no', { n: Number(c.episode_no) })} · ${c.title}`,
      }))
  );

  return (
    <div className="space-y-5">
      <PageHeader
        back="/clips/calendar"
        title={weekRange(week, locale)}
        aside={<span className="text-sm text-gray-500 tabular-nums">{week}</span>}
      />

      <section className={card}>
        <h3 className="font-semibold text-gray-900">{t('clips.week.emptyHeading')}</h3>
        {brk ? (
          <p className="text-sm text-gray-600">{t('clips.calendar.break', { name: brk.name })}</p>
        ) : (
          <>
            <p className="text-sm text-gray-500">{t('clips.people.maker')}</p>
            <p className="font-medium text-gray-900">
              {maker.name ? `${maker.name}${maker.tentative ? '?' : ''}` : <span className="font-normal text-gray-500">{maker.note}</span>}
            </p>
            {maker.name && <p className="text-xs text-gray-500">{maker.note}</p>}
            {maker.warning && <p className="text-sm text-amber-800">{maker.warning}</p>}
          </>
        )}
      </section>

      {problem ? (
        <p className="text-sm text-gray-500">{t(PROBLEM_KEY[problem])}</p>
      ) : (
        <>
          <section className={card}>
            <h3 className="font-semibold text-gray-900">{t('clips.week.bookHeading')}</h3>
            <BookIntoWeek week={week} queued={queued} />
          </section>
          <NewTopic freeWeeks={[{ key: week, label: `${week.replace(/^\d{4}-/, '')} · ${weekRange(week, locale)}` }]} presetWeek={week} />
        </>
      )}
    </div>
  );
}
