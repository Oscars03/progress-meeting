import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/lib/ui/page-header';
import { requirePageSession } from '@/lib/auth-guard';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import type { TranslationKey } from '@/lib/ui/i18n';
import { formatLabTime, labDay } from '@/lib/lab-time';
import { weekKey } from '@/lib/week';
import { isMember } from '@/lib/members';
import { isLabFacebookUrl, safeHttpsUrl } from '@/lib/safe-url';
import {
  CLIP_STAGES,
  bookableWeeks,
  canonicalForWeek,
  clashingIds,
  dueAt,
  durationOf,
  formatDuration,
  isLate,
  moveNoticeActive,
  nextFreeWeek,
  seriesColor,
  seriesStartWeek,
  statusOf,
} from '@/lib/clips';
import { loadClips } from '../../load';
import { STATUS_KEY, nameFrom, peopleOf, weekLabel, weekOptions } from '../../describe';
import { More, MoreSection, NotReady, Swatch } from '../../clip-ui';
import {
  DeleteEpisode,
  EpisodeTextPanel,
  NextStep,
  PlannerPanel,
  PublishPanel,
  StageExtras,
  WeekPanel,
  WorkPanel,
} from '../../episode-panels';

/** Where each stage's "next step" leads, in the stepper's words. */
const NEXT_HINT: Record<string, TranslationKey> = {
  book: 'clips.next.book',
  start: 'clips.next.start',
  ready: 'clips.next.ready',
  publish: 'clips.next.publish',
};

/**
 * One episode. Three parts, top to bottom:
 *
 * 1. what it is: week, due date, planner, maker (and the Facebook post once
 *    published) -- read-only;
 * 2. the one next step, as the page's only main button;
 * 3. "more": every other control, folded away (change week, change planner,
 *    draft/notes/due, rename, step back, skip, delete).
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
  const people = peopleOf(clip, data, t, locale);
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
  const due = dueAt(clip);
  const late = isLate(clip, now);
  const draft = safeHttpsUrl(clip.draft_url);
  const post = isLabFacebookUrl(clip.published_url) ? safeHttpsUrl(clip.published_url) : null;
  const planner = clip.planner_id ? data.users.find((u) => u.id === clip.planner_id) : null;
  const plannerLeft = planner ? !isMember(planner) : false;
  const textLocked = !isAdmin && (published || Boolean(clip.week_key && clip.week_key < today));
  const canDelete =
    isAdmin || (status === 'planned' && (clip.created_by === actor.id || series?.created_by === actor.id));
  const defaultPoster = data.members.some((m) => m.id === actor.id) ? actor.id : '';

  // The single next step. Published and skipped have none.
  const step: 'book' | 'start' | 'ready' | 'publish' | null =
    status === 'planned' ? (clip.week_key ? 'start' : 'book') : status === 'in_production' ? 'ready' : status === 'ready' ? 'publish' : null;
  const needsPlanner = step === 'start' && !clip.planner_id;

  const stageIndex = CLIP_STAGES.indexOf(status as (typeof CLIP_STAGES)[number]);
  const backTo = stageIndex > 0 && (!published || isAdmin) ? CLIP_STAGES[stageIndex - 1] : null;

  const row = 'grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-0.5 py-2.5 first:pt-0 last:pb-0';

  return (
    <div className="space-y-5">
      <PageHeader
        back={series ? `/clips/series/${series.id}` : '/clips'}
        title={<span className="break-words">{clip.title}</span>}
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
            {due && !published && status !== 'skipped' && (
              <span className={`block ${late ? 'text-red-700' : 'text-gray-500'}`}>
                {t(late ? 'clips.week.lateDue' : 'clips.week.due', { when: formatLabTime(due, locale) })}
              </span>
            )}
          </dd>
        </div>
        <div className={row}>
          <dt className="text-gray-500">{t('clips.people.planner')}</dt>
          <dd className="min-w-0 text-gray-900">
            {clip.planner_id ? name(clip.planner_id) : <span className="text-gray-500">{t('clips.people.plannerNone')}</span>}
            {plannerLeft && <span className="block text-amber-800">{t('clips.people.plannerLeft')}</span>}
          </dd>
        </div>
        <div className={row}>
          <dt className="text-gray-500">{t('clips.people.maker')}</dt>
          <dd className="min-w-0 text-gray-900">
            {people.makerText.name ? people.maker : <span className="text-gray-500">{people.makerText.note}</span>}
            {people.makerText.name && <span className="block text-xs text-gray-500">{people.makerText.note}</span>}
            {people.makerText.warning && <span className="block text-amber-800">{people.makerText.warning}</span>}
          </dd>
        </div>
        {duration !== null && (
          <div className={row}>
            <dt className="text-gray-500">{t('clips.work.length')}</dt>
            <dd className="text-gray-900 tabular-nums">{formatDuration(duration)}</dd>
          </div>
        )}
        {draft && (
          <div className={row}>
            <dt className="text-gray-500">{t('clips.work.draft')}</dt>
            <dd className="min-w-0 break-all">
              <a href={draft} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {draft}
              </a>
            </dd>
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
        {(clip.details || clip.notes) && (
          <div className="py-2.5 last:pb-0 space-y-1.5">
            {clip.details && <p className="text-gray-800 whitespace-pre-line break-words">{clip.details}</p>}
            {clip.notes && <p className="text-gray-600 whitespace-pre-line break-words">{clip.notes}</p>}
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
      {people.same && (
        <p className="p-2.5 text-sm rounded-lg border bg-amber-50 text-amber-800 border-amber-200">{t('clips.people.samePerson')}</p>
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
            needsPlanner={needsPlanner}
            duration={duration}
            publish={{ date: labDay(now), postedBy: defaultPoster }}
          />
        </section>
      )}
      {status === 'skipped' && <p className="text-sm text-gray-600">{t('clips.stage.skippedNote')}</p>}
      {locked && <p className="text-sm text-gray-500">{t('clips.error.publishedLocked')}</p>}

      {/* 3. Everything else */}
      {!locked && (
        <More label={t('clips.more')}>
          {!skippedLocked && (
            <MoreSection title={t(clip.week_key ? 'clips.more.changeWeek' : 'clips.more.pickWeek')}>
              <WeekPanel clip={{ ...base, week: clip.week_key, inWork: status !== 'planned' }} freeWeeks={freeWeeks} />
            </MoreSection>
          )}
          {!needsPlanner && (
            <MoreSection title={t('clips.people.planner')}>
              <PlannerPanel clip={base} plannerId={clip.planner_id} members={data.members} canClear={status === 'planned'} />
            </MoreSection>
          )}
          <MoreSection title={t('clips.more.work')}>
            <WorkPanel
              clip={base}
              duration={duration}
              showLength={status === 'ready' || published}
              draftUrl={clip.draft_url}
              notes={clip.notes}
              dueDate={clip.due_at ? labDay(new Date(clip.due_at)) : ''}
            />
          </MoreSection>
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
          <MoreSection title={t('clips.more.rename')}>
            {textLocked ? (
              <p className="text-sm text-gray-500">{t('clips.error.pastWeekLocked')}</p>
            ) : (
              <EpisodeTextPanel clip={base} title={clip.title} details={clip.details} />
            )}
          </MoreSection>
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
          {canDelete && (
            <div className="pt-4 border-t border-gray-100">
              <DeleteEpisode clip={base} seriesId={clip.series_id} />
            </div>
          )}
        </More>
      )}
    </div>
  );
}
