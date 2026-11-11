import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/lib/ui/page-header';
import InfoTip from '@/lib/ui/info-tip';
import { Avatar } from '@/lib/ui/avatar';
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
  clashingIds,
  canonicalForWeek,
  dueAt,
  durationOf,
  episodesOf,
  formatDuration,
  isLate,
  moveNoticeActive,
  nextFreeWeek,
  seriesColor,
  seriesStartWeek,
  statusOf,
  transitionProblem,
  type ClipStatus,
  type TransitionProblem,
} from '@/lib/clips';
import { loadClips } from '../../load';
import { STATUS_KEY, chipFor, nameFrom, peopleOf, weekLabel, weekOptions } from '../../describe';
import { Chip, NotReady, Swatch } from '../../clip-ui';
import {
  EpisodeTextPanel,
  PlannerPanel,
  PublishPanel,
  StagePanel,
  WeekPanel,
  WorkPanel,
} from '../../episode-panels';

const BLOCKED: Record<TransitionProblem, TranslationKey | null> = {
  notOneStep: null,
  adminOnly: null,
  usePublishForm: null,
  needsWeek: 'clips.error.needsWeek',
  plannerRequired: 'clips.error.plannerRequired',
  durationRequired: 'clips.error.durationRequired',
};

const FORWARD_LABEL: Partial<Record<ClipStatus, TranslationKey>> = {
  in_production: 'clips.stage.toInProduction',
  ready: 'clips.stage.toReady',
};

/**
 * One episode, the Studio "Details" view: what it is about, who plans and who
 * makes it, where it stands in the 4 stages, its length and links, and the
 * record of its post on the lab's Facebook Page.
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
  const name = nameFrom(data.users, t);
  const people = peopleOf(clip, data, t, locale);
  const card = 'p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3';

  const siblings = series ? episodesOf(series.id, data.clips) : [clip];
  const position = siblings.findIndex((c) => c.id === clip.id);
  const prev = position > 0 ? siblings[position - 1] : null;
  const next = position >= 0 && position < siblings.length - 1 ? siblings[position + 1] : null;

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

  // The next stage and what stands in its way. Published is reached through
  // the publish form, so `ready` has no forward button.
  const stageIndex = CLIP_STAGES.indexOf(status as (typeof CLIP_STAGES)[number]);
  const forwardTo = stageIndex >= 0 && stageIndex < 2 ? CLIP_STAGES[stageIndex + 1] : null;
  const forward = forwardTo
    ? {
        to: forwardTo,
        label: FORWARD_LABEL[forwardTo]!,
        blocked: (() => {
          const p = transitionProblem(clip, forwardTo, isAdmin);
          return p ? BLOCKED[p] : null;
        })(),
      }
    : null;
  const backTo =
    stageIndex > 0 && (!published || isAdmin) ? CLIP_STAGES[stageIndex - 1] : null;

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
  const chip = chipFor(clip);

  return (
    <div className="space-y-5">
      <PageHeader
        back={series ? `/clips/series/${series.id}` : '/clips'}
        title={<span className="break-words">{clip.title}</span>}
        aside={<Chip label={t(chip.label)} style={chip.style} />}
        description={
          <p className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            {series && <Swatch color={seriesColor(series)} />}
            {series ? (
              <Link href={`/clips/series/${series.id}`} className="tap-exempt hover:underline">
                {series.title}
              </Link>
            ) : (
              t('clips.episode.noSeries')
            )}
            <span>· {t('clips.episode.position', { n: Number(clip.episode_no), of: siblings.length })}</span>
          </p>
        }
      />

      {(prev || next) && (
        <nav className="flex flex-wrap justify-between gap-2 text-sm">
          {prev ? (
            <Link href={`/clips/episode/${prev.id}`} className="btn btn-ghost btn-sm">
              ‹ {t('clips.episode.no', { n: Number(prev.episode_no) })}
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link href={`/clips/episode/${next.id}`} className="btn btn-ghost btn-sm">
              {t('clips.episode.no', { n: Number(next.episode_no) })} ›
            </Link>
          )}
        </nav>
      )}

      {clip.details && (
        <section className={card}>
          <p className="text-sm text-gray-800 whitespace-pre-line break-words">{clip.details}</p>
        </section>
      )}

      {/* Week */}
      <section className={card}>
        <h3 className="font-semibold text-gray-900">{t('clips.week.heading')}</h3>
        <p className="text-base text-gray-900">
          {clip.week_key ? weekLabel(clip.week_key, locale) : t('clips.status.queued')}
          {clip.week_key === today && <span className="ml-2 text-sm text-blue-700">★ {t('clips.week.thisWeek')}</span>}
        </p>
        {due && (
          <p className={`text-sm ${late ? 'text-red-700' : 'text-gray-500'}`}>
            {t(late ? 'clips.week.lateDue' : 'clips.week.due', { when: formatLabTime(due, locale) })}
          </p>
        )}
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
        <WeekPanel
          clip={{ id: clip.id, rowVersion: clip.row_version, week: clip.week_key, inWork: status !== 'planned' }}
          freeWeeks={freeWeeks}
          nextFree={nextFree ? { key: nextFree, label: weekLabel(nextFree, locale) } : null}
          locked={locked}
        />
      </section>

      {/* Planner and maker */}
      <section className={card}>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">{t('clips.people.heading')}</h3>
          <InfoTip>{t('clips.people.hint')}</InfoTip>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-sm text-gray-500">{t('clips.people.planner')}</p>
            <p className="flex items-center gap-2 font-medium text-gray-900">
              {planner && data.faces.get(planner.id) && <Avatar person={data.faces.get(planner.id)!} />}
              {clip.planner_id ? name(clip.planner_id) : <span className="font-normal text-gray-500">{t('clips.people.plannerNone')}</span>}
            </p>
            {clip.planner_set_by && (
              <p className="text-xs text-gray-500">
                {t('clips.people.setBy', { name: name(clip.planner_set_by), when: formatLabTime(clip.planner_set_at, locale) })}
              </p>
            )}
            {plannerLeft && <p className="text-sm text-amber-800">{t('clips.people.plannerLeft')}</p>}
            <PlannerPanel
              clip={{ id: clip.id, rowVersion: clip.row_version }}
              plannerId={clip.planner_id}
              members={data.members}
              canClear={status === 'planned'}
              locked={locked}
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-gray-500">{t('clips.people.maker')}</p>
            <p className="flex items-center gap-2 font-medium text-gray-900">
              {people.makerUserId && data.faces.get(people.makerUserId) && (
                <Avatar person={data.faces.get(people.makerUserId)!} />
              )}
              {people.makerText.name ? people.maker : <span className="font-normal text-gray-500">{people.makerText.note}</span>}
            </p>
            {people.makerText.name && <p className="text-xs text-gray-500">{people.makerText.note}</p>}
            {people.makerText.warning && <p className="text-sm text-amber-800">{people.makerText.warning}</p>}
          </div>
        </div>
        {people.same && (
          <p className="p-2.5 text-sm rounded-lg border bg-amber-50 text-amber-800 border-amber-200">
            {t('clips.people.samePerson')}
          </p>
        )}
      </section>

      {/* Stage */}
      <section className={card}>
        <h3 className="font-semibold text-gray-900">{t('clips.stage.heading')}</h3>
        <ol className="flex flex-wrap gap-1.5 text-xs">
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
        </ol>
        {status === 'skipped' && <p className="text-sm text-gray-600">{t('clips.stage.skippedNote')}</p>}
        {status === 'ready' && !published && <p className="text-sm text-gray-600">{t('clips.stage.readyNote')}</p>}
        <StagePanel
          clip={{ id: clip.id, rowVersion: clip.row_version }}
          status={status}
          forward={forward}
          backTo={backTo}
          isAdmin={isAdmin}
        />
      </section>

      {/* Work */}
      <section className={card}>
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-gray-900">{t('clips.work.heading')}</h3>
          <InfoTip>{t('clips.work.hint')}</InfoTip>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">{t('clips.work.duration')}</dt>
          <dd className="text-gray-900 tabular-nums">{duration !== null ? formatDuration(duration) : '—'}</dd>
          <dt className="text-gray-500">{t('clips.work.draft')}</dt>
          <dd className="min-w-0 break-all">
            {draft ? (
              <a href={draft} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {draft}
              </a>
            ) : (
              '—'
            )}
          </dd>
        </dl>
        {clip.notes && <p className="text-sm text-gray-700 whitespace-pre-line break-words">{clip.notes}</p>}
        <WorkPanel
          clip={{ id: clip.id, rowVersion: clip.row_version }}
          duration={duration}
          draftUrl={clip.draft_url}
          notes={clip.notes}
          dueDate={clip.due_at ? labDay(new Date(clip.due_at)) : ''}
          locked={locked}
        />
      </section>

      {/* Publish */}
      {(status === 'ready' || published) && (
        <section className={card}>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{t('clips.publish.heading')}</h3>
            <InfoTip>{t('clips.publish.hint')}</InfoTip>
          </div>
          {published && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-gray-500">{t('clips.publish.url')}</dt>
              <dd className="min-w-0 break-all">
                {post ? (
                  <a href={post} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {post}
                  </a>
                ) : (
                  '—'
                )}
              </dd>
              <dt className="text-gray-500">{t('clips.publish.date')}</dt>
              <dd className="text-gray-900">
                {clip.published_at
                  ? new Date(clip.published_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'Asia/Bangkok',
                    })
                  : '—'}
              </dd>
              <dt className="text-gray-500">{t('clips.publish.by')}</dt>
              <dd className="text-gray-900">{clip.published_by ? name(clip.published_by) : '—'}</dd>
            </dl>
          )}
          {!locked && (
            <PublishPanel
              clip={{ id: clip.id, rowVersion: clip.row_version }}
              url={clip.published_url}
              date={clip.published_at ? labDay(new Date(clip.published_at)) : labDay(now)}
              postedBy={clip.published_by || defaultPoster}
              members={data.members}
              isPublished={published}
            />
          )}
        </section>
      )}

      <section className={card}>
        {textLocked && <p className="text-sm text-gray-500">{t(published ? 'clips.error.publishedLocked' : 'clips.error.pastWeekLocked')}</p>}
        <EpisodeTextPanel
          clip={{ id: clip.id, rowVersion: clip.row_version }}
          title={clip.title}
          details={clip.details}
          canEdit={!textLocked}
          canDelete={canDelete}
          seriesId={clip.series_id}
        />
      </section>
    </div>
  );
}
