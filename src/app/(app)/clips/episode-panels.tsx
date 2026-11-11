'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useConfirm } from '@/lib/ui/confirm';
import { useToast } from '@/lib/ui/toast';
import { MAX_DURATION_SEC, formatDuration, parseDuration } from '@/lib/clips';
import type { TranslationKey } from '@/lib/ui/i18n';
import {
  deleteEpisodeAction,
  moveEpisodeAction,
  publishEpisodeAction,
  setEpisodeStatusAction,
  setPlannerAction,
  unbookEpisodeAction,
  updateEpisodeAction,
  updateEpisodeWorkAction,
} from './actions';
import { ErrorLine, FIELD, useClipAction } from './use-clip-action';
import { QueueBooking, type WeekOption } from './clip-forms';

type Base = { id: string; rowVersion: number };
type Member = { id: string; name: string };

/** Book, move or unbook. Free weeks only; published episodes are admin's. */
export function WeekPanel({
  clip,
  freeWeeks,
  nextFree,
  locked,
}: {
  clip: Base & { week: string; inWork: boolean };
  freeWeeks: WeekOption[];
  nextFree: WeekOption | null;
  locked: boolean;
}) {
  const { t } = usePrefs();
  const ask = useConfirm();
  const [week, setWeek] = useState('');
  const { run, pending, error } = useClipAction();

  if (locked) return null;
  if (!clip.week) {
    return <QueueBooking clipId={clip.id} rowVersion={clip.rowVersion} nextFree={nextFree} freeWeeks={freeWeeks} />;
  }

  const move = async () => {
    // Moving work somebody has started is allowed (D20), but they should know
    // it is about to happen.
    if (clip.inWork && !(await ask(t('clips.move.confirmInWork')))) return;
    run(() => moveEpisodeAction(clip.id, clip.rowVersion, week), { done: t('clips.toast.moved') });
  };

  const unbook = async () => {
    if (!(await ask(t(clip.inWork ? 'clips.unbook.confirmInWork' : 'clips.unbook.confirm')))) return;
    run(() => unbookEpisodeAction(clip.id, clip.rowVersion), { done: t('clips.toast.unbooked') });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`move-${clip.id}`}>
          {t('clips.move.pick')}
        </label>
        <select id={`move-${clip.id}`} className={`${FIELD} w-auto max-w-full`} value={week} onChange={(e) => setWeek(e.target.value)}>
          <option value="">{t('clips.move.pick')}</option>
          {freeWeeks.map((w) => (
            <option key={w.key} value={w.key}>
              {w.label}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending || !week} onClick={move}>
          {t('clips.move.submit')}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={unbook}>
          {t('clips.unbook.submit')}
        </button>
      </div>
      {nextFree === null && freeWeeks.length === 0 && <p className="text-sm text-gray-500">{t('clips.book.noneFree')}</p>}
      <ErrorLine text={error} />
    </div>
  );
}

/** Record the planner (D25): anybody, any active member. */
export function PlannerPanel({
  clip,
  plannerId,
  members,
  canClear,
  locked,
}: {
  clip: Base;
  plannerId: string;
  members: Member[];
  canClear: boolean;
  locked: boolean;
}) {
  const { t } = usePrefs();
  const toast = useToast();
  const [pick, setPick] = useState(plannerId);
  const { run, pending, error } = useClipAction();

  if (locked) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`planner-${clip.id}`}>
          {t('clips.people.planner')}
        </label>
        <select id={`planner-${clip.id}`} className={`${FIELD} w-auto max-w-full`} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="" disabled={!canClear}>
            {t('clips.people.plannerNone')}
          </option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={pending || pick === plannerId}
          onClick={() =>
            run(() => setPlannerAction(clip.id, pick, clip.rowVersion), {
              after: (res) => toast(res.sameAsMaker ? t('clips.people.samePersonSaved') : t('common.saved')),
            })
          }
        >
          {t('clips.people.setPlanner')}
        </button>
      </div>
      <ErrorLine text={error} />
    </div>
  );
}

/** One stage forward or back (D9), and admin's skip. */
export function StagePanel({
  clip,
  status,
  forward,
  backTo,
  isAdmin,
}: {
  clip: Base;
  status: string;
  /** The next stage and what stands in its way, if anything; null at the end. */
  forward: { to: string; label: TranslationKey; blocked: TranslationKey | null } | null;
  backTo: string | null;
  isAdmin: boolean;
}) {
  const { t } = usePrefs();
  const ask = useConfirm();
  const { run, pending, error } = useClipAction();

  const go = (to: string) => run(() => setEpisodeStatusAction(clip.id, to, clip.rowVersion), { done: t('common.saved') });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {forward && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending || forward.blocked !== null}
            onClick={() => go(forward.to)}
          >
            {t(forward.label)}
          </button>
        )}
        {backTo && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => go(backTo)}>
            {t('clips.stage.back')}
          </button>
        )}
        {isAdmin && status !== 'published' && status !== 'skipped' && (
          <button
            type="button"
            className="btn btn-danger-soft btn-sm"
            disabled={pending}
            onClick={async () => {
              if (await ask(t('clips.stage.confirmSkip'))) go('skipped');
            }}
          >
            {t('clips.stage.skip')}
          </button>
        )}
        {isAdmin && status === 'skipped' && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => go('planned')}>
            {t('clips.stage.unskip')}
          </button>
        )}
      </div>
      {forward?.blocked && <p className="text-sm text-amber-800">{t(forward.blocked)}</p>}
      <ErrorLine text={error} />
    </div>
  );
}

/**
 * Length, draft link, notes and due date. The 5:00 cap shows as an inline
 * error and holds the save button back; the server refuses it regardless.
 */
export function WorkPanel({
  clip,
  duration,
  draftUrl,
  notes,
  dueDate,
  locked,
}: {
  clip: Base;
  duration: number | null;
  draftUrl: string;
  notes: string;
  /** YYYY-MM-DD when a due date was set by hand, else ''. */
  dueDate: string;
  locked: boolean;
}) {
  const { t } = usePrefs();
  const [length, setLength] = useState(duration === null ? '' : formatDuration(duration));
  const [draft, setDraft] = useState(draftUrl);
  const [text, setText] = useState(notes);
  const [due, setDue] = useState(dueDate);
  const { run, pending, error } = useClipAction();

  const parsed = length.trim() ? parseDuration(length) : null;
  const lengthProblem = !length.trim()
    ? null
    : parsed === null || parsed < 1
      ? t('clips.error.durationInvalid')
      : parsed > MAX_DURATION_SEC
        ? t('clips.error.tooLong', { length: formatDuration(parsed) })
        : null;

  if (locked) return null;

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () => updateEpisodeWorkAction(clip.id, { duration: length, draftUrl: draft, notes: text, dueDate: due }, clip.rowVersion),
          { done: t('common.saved') }
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-700">{t('clips.work.duration')}</span>
          <input
            className={`${FIELD} mt-1 tabular-nums`}
            inputMode="numeric"
            placeholder="4:30"
            value={length}
            aria-invalid={lengthProblem !== null}
            onChange={(e) => setLength(e.target.value)}
          />
          {lengthProblem && <span className="block mt-1 text-sm text-red-700">{lengthProblem}</span>}
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">{t('clips.work.due')}</span>
          <input type="date" className={`${FIELD} mt-1`} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.work.draft')}</span>
        <input
          type="url"
          className={`${FIELD} mt-1`}
          placeholder="https://"
          value={draft}
          maxLength={2048}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.work.notes')}</span>
        <textarea className={`${FIELD} mt-1`} rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <ErrorLine text={error} />
      <button type="submit" className="btn btn-primary" disabled={pending || lengthProblem !== null}>
        {pending ? t('common.saving') : t('common.save')}
      </button>
    </form>
  );
}

/** The post on the lab's Facebook Page (D6, D14). */
export function PublishPanel({
  clip,
  url,
  date,
  postedBy,
  members,
  isPublished,
}: {
  clip: Base;
  url: string;
  date: string;
  postedBy: string;
  members: Member[];
  isPublished: boolean;
}) {
  const { t } = usePrefs();
  const [link, setLink] = useState(url);
  const [day, setDay] = useState(date);
  const [who, setWho] = useState(postedBy);
  const { run, pending, error } = useClipAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => publishEpisodeAction(clip.id, { url: link, date: day, postedBy: who }, clip.rowVersion), {
          done: isPublished ? t('common.saved') : t('clips.toast.published'),
        });
      }}
    >
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.publish.url')}</span>
        <input
          type="url"
          className={`${FIELD} mt-1`}
          placeholder="https://www.facebook.com/…"
          value={link}
          maxLength={2048}
          required
          onChange={(e) => setLink(e.target.value)}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-gray-700">{t('clips.publish.date')}</span>
          <input type="date" className={`${FIELD} mt-1`} value={day} required onChange={(e) => setDay(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">{t('clips.publish.by')}</span>
          <select className={`${FIELD} mt-1`} value={who} required onChange={(e) => setWho(e.target.value)}>
            <option value="">{t('common.unspecified')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ErrorLine text={error} />
      <button type="submit" className="btn btn-primary" disabled={pending || !link.trim() || !day || !who}>
        {isPublished ? t('common.save') : t('clips.publish.submit')}
      </button>
    </form>
  );
}

/** Reword the episode, and remove it. */
export function EpisodeTextPanel({
  clip,
  title,
  details,
  canEdit,
  canDelete,
  seriesId,
}: {
  clip: Base;
  title: string;
  details: string;
  canEdit: boolean;
  canDelete: boolean;
  seriesId: string;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(title);
  const [body, setBody] = useState(details);
  const { run, pending, error } = useClipAction();

  if (!canEdit && !canDelete) return null;

  if (editing) {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateEpisodeAction(clip.id, { title: name, details: body }, clip.rowVersion), {
            done: t('common.saved'),
            after: () => setEditing(false),
          });
        }}
      >
        <label className="block text-sm">
          <span className="text-gray-700">{t('clips.form.episodeTitle')}</span>
          <input className={`${FIELD} mt-1`} value={name} maxLength={200} required onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">{t('clips.form.details')}</span>
          <textarea className={`${FIELD} mt-1`} rows={4} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
        </label>
        <ErrorLine text={error} />
        <div className="flex flex-wrap gap-2">
          <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
            {pending ? t('common.saving') : t('common.save')}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
            {t('common.cancel')}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            {t('clips.episode.edit')}
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className="btn btn-danger-soft btn-sm"
            disabled={pending}
            onClick={async () => {
              if (!(await ask(t('clips.episode.confirmDelete'), { danger: true }))) return;
              run(() => deleteEpisodeAction(clip.id, clip.rowVersion), {
                after: () => {
                  toast(t('clips.toast.episodeDeleted'));
                  router.push(`/clips/series/${seriesId}`);
                },
                refresh: false,
              });
            }}
          >
            {t('clips.episode.delete')}
          </button>
        )}
      </div>
      <ErrorLine text={error} />
    </div>
  );
}
