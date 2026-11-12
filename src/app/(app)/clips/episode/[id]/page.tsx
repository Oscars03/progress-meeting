import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/lib/ui/page-header';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import type { TranslationKey } from '@/lib/ui/i18n';
import { formatLabTime, labDay } from '@/lib/lab-time';
import { weekKey } from '@/lib/week';
import { isLabFacebookUrl, safeHttpsUrl } from '@/lib/safe-url';
import {
  CLIP_STAGES,
  bookableWeeks,
  canonicalForWeek,
  clashingIds,
  durationOf,
  episodeDeleteProblem,
  episodeEditProblem,
  formatDuration,
  moveNoticeActive,
  nextFreeWeek,
  seriesColor,
  seriesStartWeek,
  statusOf,
} from '@/lib/clips';
import { loadClips } from '../../load';
import { STATUS_KEY, makerOf, nameFrom, weekLabel, weekOptions } from '../../describe';
import { More, MoreSection, NotReady, Swatch } from '../../clip-ui';
import { EpisodeActions } from '../../episode-actions';
import {
  LengthPanel,
  NextStep,
  PublishPanel,
  StageExtras,
  WeekPanel,
} from '../../episode-panels';

/** Where each stage's "next step" leads, in the stepper's words. */
const NEXT_HINT: Record<string, TranslationKey> = {
  book: 'clips.next.book',
  start: 'clips.next.start',
  ready: 'clips.next.ready',
  publish: 'clips.next.publish',
};

/**
 * One episode. Four parts, top to bottom:
 *
 * 1. what it is: week, maker, length (and the Facebook post once published)
 *    -- read-only;
 * 2. the one next step, as the page's only main button;
 * 3. its week: move to another, or take it out -- in plain sight;
 * 4. "more": every other control, folded away (length once ready, publish
 *    record, step back, skip).
 *
 * Edit (title and details) and delete are icons in the header, each shown
 * only to whom the action would allow.
 */
export default async function EpisodePage(props: { params: Promise<{ id: string }> }) {
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

  const clip = data.clips.find((c) => c.id === id);
  if (!clip) notFound();
  const series = data.series.find((s) => s.id === clip.series_id);

  const isAdmin = actor.role === 'admin';
  const today = weekKey();
  const now = new Date();
  const status = statusOf(clip);
  const published = status === 'published';
  const locked = published && !isAdmin;
  const skippedLocked = status === 'skipped' && !isAdmin;
  const name = nameFrom(data.users, t);
  const { makerText } = makerOf(clip, data, t, locale);
  const base = { id: clip.id, rowVersion: clip.row_version };

  const taken = new Set(data.clips.map((c) => c.week_key).filter(Boolean));
  const freeWeeks = weekOptions(
    bookableWeeks(data.breaks, today).filter((k) => !taken.has(k)),
    locale
  );
  const nextFree = clip.week_key
    ? null
    : nextFreeWeek(data.clips, data.breaks, seriesStartWeek(data.clips, clip, today), today);

  const clash = clip.week_key && clashingIds(data.clips).has(clip.id);
  const holdsWeek = clip.week_key ? canonicalForWeek(data.clips, clip.week_key)?.id === clip.id : true;

  const duration = durationOf(clip);
  const post = isLabFacebookUrl(clip.published_url) ? safeHttpsUrl(clip.published_url) : null;
  const canEdit = episodeEditProblem(actor, clip, today) === null;
  const canDelete = episodeDeleteProblem(actor, clip, series?.created_by) === null;
  const defaultPoster = data.members.some((m) => m.id === actor.id) ? actor.id : '';

  // The single next step. Published and skipped have none.
  const step: 'book' | 'start' | 'ready' | 'publish' | null =
    status === 'planned' ? (clip.week_key ? 'start' : 'book') : status === 'in_production' ? 'ready' : status === 'ready' ? 'publish' : null;

  const stageIndex = CLIP_STAGES.indexOf(status as (typeof CLIP_STAGES)[number]);
  const backTo = stageIndex > 0 && (!published || isAdmin) ? CLIP_STAGES[stageIndex - 1] : null;
  const hasMore = status === 'ready' || published || Boolean(backTo) || isAdmin;

  const row = 'grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-0.5 py-2.5 first:pt-0 last:pb-0';

  return (
    <div className="space-y-5">
      <PageHeader
        back={series ? `/clips/series/${series.id}` : '/clips'}
        title={<span className="break-words">{clip.title}</span>}
        actions={
          canEdit || canDelete ? (
            <EpisodeActions
              episode={{ ...base, no: Number(clip.episode_no), title: clip.title, details: clip.details }}
              canEdit={canEdit}
              canDelete={canDelete}
              afterDelete={series ? `/clips/series/${series.id}` : '/clips'}
            />
          ) : undefined
        }
        description={
          series ? (
            <p className="inline-flex flex-wrap items-center gap-x-2">
              <Swatch color={seriesColor(series)} />
              <Link href={`/clips/series/${series.id}`} className="tap-exempt hover:underline">
                {series.title}
              </Link>
              <span>· {t('clips.episode.no', { n: Number(clip.episode_no) })}</span>
            </p>
          ) : (
            t('clips.episode.noSeries')
          )
        }
      />

      {/* Where it stands: the 4 stages, the current one marked. */}
      <ol className="flex flex-wrap gap-1.5 text-xs" aria-label={t('clips.stage.heading')}>
        {CLIP_STAGES.map((stage, i) => {
          const done = stageIndex >= 0 && i < stageIndex;
          const here = stage === status;
          return (
            <li
              key={stage}
              aria-current={here ? 'step' : undefined}
              className={`px-2.5 py-1 rounded-full font-medium ${
                here ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' : done ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {done ? '✓ ' : ''}
              {t(STATUS_KEY[stage])}
            </li>
          );
        })}
        {status === 'skipped' && (
          <li aria-current="step" className="px-2.5 py-1 rounded-full font-medium bg-gray-100 text-gray-700 ring-1 ring-gray-300">
            {t('clips.status.skipped')}
          </li>
        )}
      </ol>

      {/* 1. What it is */}
      <dl className="p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 text-sm">
        <div className={row}>
          <dt className="text-gray-500">{t('clips.week.heading')}</dt>
          <dd className="min-w-0 text-gray-900">
            {clip.week_key ? weekLabel(clip.week_key, locale) : t('clips.status.queued')}
            {clip.week_key === today && <span className="ml-2 text-blue-700">{t('clips.week.thisWeek')}</span>}
          </dd>
        </div>
        <div className={row}>
          <dt className="text-gray-500">{t('clips.people.maker')}</dt>
          <dd className="min-w-0 text-gray-900">
            {makerText.name ? (
              `${makerText.name}${makerText.tentative ? '?' : ''}`
            ) : (
              <span className="text-gray-500">{makerText.note}</span>
            )}
            {makerText.name && <span className="block text-xs text-gray-500">{makerText.note}</span>}
            {makerText.warning && <span className="block text-amber-800">{makerText.warning}</span>}
          </dd>
        </div>
        {duration !== null && (
          <div className={row}>
            <dt className="text-gray-500">{t('clips.work.length')}</dt>
            <dd className="text-gray-900 tabular-nums">{formatDuration(duration)}</dd>
          </div>
        )}
        {published && (
          <div className={row}>
            <dt className="text-gray-500">{t('clips.publish.url')}</dt>
            <dd className="min-w-0 space-y-0.5">
              {post ? (
                <a href={post} target="_blank" rel="noopener noreferrer" className="block break-all text-blue-600 hover:underline">
                  {post}
                </a>
              ) : (
                '—'
              )}
              <span className="block text-gray-500">
                {t('clips.publish.record', {
                  date: clip.published_at
                    ? new Date(clip.published_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        timeZone: 'Asia/Bangkok',
                      })
                    : '—',
                  who: clip.published_by ? name(clip.published_by) : '—',
                })}
              </span>
            </dd>
          </div>
        )}
        {clip.details && (
          <div className="py-2.5 last:pb-0">
            <p className="text-gray-800 whitespace-pre-line break-words">{clip.details}</p>
          </div>
        )}
      </dl>

      {/* Things to know before acting. */}
      {clash && (
        <p className="p-2.5 text-sm rounded-lg border bg-red-50 text-red-800 border-red-200">
          {t(holdsWeek ? 'clips.week.clashHolds' : 'clips.week.clashMustMove')}
        </p>
      )}
      {moveNoticeActive(clip, now) && (
        <p className="p-2.5 text-sm rounded-lg border bg-amber-50 text-amber-800 border-amber-200">
          {clip.week_key
            ? t('clips.week.moved', {
                from: clip.moved_from ? weekLabel(clip.moved_from, locale) : '—',
                to: weekLabel(clip.week_key, locale),
                who: name(clip.moved_by),
                when: formatLabTime(clip.moved_at, locale),
              })
            : t('clips.week.unbooked', {
                from: clip.moved_from ? weekLabel(clip.moved_from, locale) : '—',
                who: name(clip.moved_by),
                when: formatLabTime(clip.moved_at, locale),
              })}
        </p>
      )}

      {/* 2. The one next step */}
      {step && !locked && (
        <section className="p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
          <h3 className="font-semibold text-gray-900">{t(NEXT_HINT[step])}</h3>
          <NextStep
            clip={base}
            step={step}
            nextFree={nextFree ? { key: nextFree, label: weekLabel(nextFree, locale) } : null}
            members={data.members}
            duration={duration}
            publish={{ date: labDay(now), postedBy: defaultPoster }}
          />
        </section>
      )}
      {status === 'skipped' && <p className="text-sm text-gray-600">{t('clips.stage.skippedNote')}</p>}
      {locked && <p className="text-sm text-gray-500">{t('clips.error.publishedLocked')}</p>}

      {/* 3. Its week, in plain sight (a published one's is admin's, under "more") */}
      {!published && !skippedLocked && (
        <section className="p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
          <h3 className="font-semibold text-gray-900">{t(clip.week_key ? 'clips.week.moveHeading' : 'clips.week.pickHeading')}</h3>
          <WeekPanel clip={{ ...base, week: clip.week_key, inWork: status !== 'planned' }} freeWeeks={freeWeeks} />
        </section>
      )}

      {/* 4. Everything else */}
      {!locked && hasMore && (
        <More label={t('clips.more')}>
          {published && (
            <MoreSection title={t(clip.week_key ? 'clips.week.moveHeading' : 'clips.week.pickHeading')}>
              <WeekPanel clip={{ ...base, week: clip.week_key, inWork: true }} freeWeeks={freeWeeks} />
            </MoreSection>
          )}
          {(status === 'ready' || published) && (
            <MoreSection title={t('clips.work.length')}>
              <LengthPanel clip={base} duration={duration} />
            </MoreSection>
          )}
          {published && (
            <MoreSection title={t('clips.more.publishRecord')}>
              <PublishPanel
                clip={base}
                url={clip.published_url}
                date={clip.published_at ? labDay(new Date(clip.published_at)) : labDay(now)}
                postedBy={clip.published_by || defaultPoster}
                members={data.members}
                isPublished
              />
            </MoreSection>
          )}
          {(backTo || isAdmin) && (
            <MoreSection title={t('clips.stage.heading')}>
              <StageExtras
                clip={base}
                backTo={backTo ? { to: backTo, label: STATUS_KEY[backTo] } : null}
                canSkip={isAdmin && status !== 'published' && status !== 'skipped'}
                canUnskip={isAdmin && status === 'skipped'}
              />
            </MoreSection>
          )}
        </More>
      )}
    </div>
  );
}
