'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useConfirm } from '@/lib/ui/confirm';
import { useToast } from '@/lib/ui/toast';
import { MAX_DURATION_SEC, formatDuration, parseDuration } from '@/lib/clips';
import type { TranslationKey } from '@/lib/ui/i18n';
import {
  bookEpisodeAction,
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
import type { WeekOption } from './clip-forms';

type Base = { id: string; rowVersion: number };
type Member = { id: string; name: string };

/** The length as typed, and what is wrong with it (the 5:00 cap), if anything. */
function useLength(initial: number | null) {
  const { t } = usePrefs();
  const [length, setLength] = useState(initial === null ? '' : formatDuration(initial));
  const parsed = length.trim() ? parseDuration(length) : null;
  const problem = !length.trim()
    ? null
    : parsed === null || parsed < 1
      ? t('clips.error.durationInvalid')
      : parsed > MAX_DURATION_SEC
        ? t('clips.error.tooLong', { length: formatDuration(parsed) })
        : null;
  return { length, setLength, problem };
}

function LengthField({
  value,
  onChange,
  problem,
  required = false,
}: {
  value: string;
  onChange: (v: string) => void;
  problem: string | null;
  required?: boolean;
}) {
  const { t } = usePrefs();
  return (
    <label className="block text-sm">
      <span className="text-gray-700">{t('clips.work.duration')}</span>
      <input
        name="length"
        autoComplete="off"
        className={`${FIELD} mt-1 tabular-nums`}
        inputMode="numeric"
        placeholder="4:30"
        value={value}
        required={required}
        aria-invalid={problem !== null}
        onChange={(e) => onChange(e.target.value)}
      />
      {problem && <span className="block mt-1 text-sm text-red-700">{problem}</span>}
    </label>
  );
}

function MemberSelect({
  label,
  value,
  onChange,
  members,
  emptyLabel,
  emptyDisabled = false,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  members: Member[];
  emptyLabel: string;
  emptyDisabled?: boolean;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-gray-700">{label}</span>
      <select className={`${FIELD} mt-1`} value={value} required={required} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled={emptyDisabled}>
          {emptyLabel}
        </option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The one thing to do next on an episode, as the page's single main button:
 * book a week, start production (recording the planner in the same tap if
 * there is none), mark it ready (with its length), or record the Facebook
 * post. The server checks every step again.
 */
export function NextStep({
  clip,
  step,
  nextFree,
  members,
  needsPlanner = false,
  duration,
  publish,
}: {
  clip: Base;
  step: 'book' | 'start' | 'ready' | 'publish';
  /** For `book`: the week a tap would take, or null when none is free. */
  nextFree: WeekOption | null;
  members: Member[];
  /** For `start`: true when a planner still has to be chosen. */
  needsPlanner?: boolean;
  duration: number | null;
  /** For `publish`: the defaults. */
  publish: { date: string; postedBy: string };
}) {
  const { t } = usePrefs();
  const { run, pending, error } = useClipAction();
  const [planner, setPlanner] = useState('');
  const { length, setLength, problem } = useLength(duration);

  if (step === 'book') {
    return (
      <div className="space-y-2">
        {nextFree ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => run(() => bookEpisodeAction(clip.id, clip.rowVersion, 'next'), { done: t('clips.toast.booked') })}
          >
            {t('clips.book.next', { week: nextFree.label })}
          </button>
        ) : (
          <p className="text-sm text-amber-800">{t('clips.book.noneFree')}</p>
        )}
        <ErrorLine text={error} />
      </div>
    );
  }

  if (step === 'publish') {
    return <PublishPanel clip={clip} url="" date={publish.date} postedBy={publish.postedBy} members={members} isPublished={false} />;
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 'start') {
          run(() => setEpisodeStatusAction(clip.id, 'in_production', clip.rowVersion, needsPlanner ? { plannerId: planner } : {}), {
            done: t('clips.toast.started'),
          });
        } else {
          run(() => setEpisodeStatusAction(clip.id, 'ready', clip.rowVersion, { duration: length }), {
            done: t('clips.toast.ready'),
          });
        }
      }}
    >
      {needsPlanner && (
        <MemberSelect
          label={t('clips.people.planner')}
          value={planner}
          onChange={setPlanner}
          members={members}
          emptyLabel={t('clips.people.pickPlanner')}
          emptyDisabled
          required
        />
      )}
      {step === 'ready' && <LengthField value={length} onChange={setLength} problem={problem} required />}
      <ErrorLine text={error} />
      <button
        type="submit"
        className="btn btn-primary"
        disabled={pending || (needsPlanner && !planner) || (step === 'ready' && (!length.trim() || problem !== null))}
      >
        {pending ? t('common.saving') : t(step === 'start' ? 'clips.stage.toInProduction' : 'clips.stage.toReady')}
      </button>
    </form>
  );
}

/**
 * Choose a week by hand, move to another, or take it out of its week. Free
 * weeks only; the server checks again.
 */
export function WeekPanel({
  clip,
  freeWeeks,
}: {
  clip: Base & { week: string; inWork: boolean };
  freeWeeks: WeekOption[];
}) {
  const { t } = usePrefs();
  const ask = useConfirm();
  const [week, setWeek] = useState('');
  const { run, pending, error } = useClipAction();

  const place = async () => {
    if (!clip.week) {
      run(() => bookEpisodeAction(clip.id, clip.rowVersion, week), { done: t('clips.toast.booked') });
      return;
    }
    // Moving work somebody has started is allowed (D20), but they should know.
    if (clip.inWork && !(await ask(t('clips.move.confirmInWork')))) return;
    run(() => moveEpisodeAction(clip.id, clip.rowVersion, week), { done: t('clips.toast.moved') });
  };

  const unbook = async () => {
    if (!(await ask(t(clip.inWork ? 'clips.unbook.confirmInWork' : 'clips.unbook.confirm')))) return;
    run(() => unbookEpisodeAction(clip.id, clip.rowVersion), { done: t('clips.toast.unbooked') });
  };

  return (
    <div className="space-y-2">
      {freeWeeks.length === 0 ? (
        <p className="text-sm text-gray-500">{t('clips.book.noneFree')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`week-${clip.id}`}>
            {t('clips.book.pick')}
          </label>
          <select id={`week-${clip.id}`} className={`${FIELD} w-auto max-w-full`} value={week} onChange={(e) => setWeek(e.target.value)}>
            <option value="">{t('clips.book.pick')}</option>
            {freeWeeks.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending || !week} onClick={place}>
            {t(clip.week ? 'clips.move.submit' : 'clips.book.submit')}
          </button>
        </div>
      )}
      {clip.week && (
        <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={unbook}>
          {t('clips.unbook.submit')}
        </button>
      )}
      <ErrorLine text={error} />
    </div>
  );
}

/** Record or change the planner (D25): anybody, any active member. */
export function PlannerPanel({
  clip,
  plannerId,
  members,
  canClear,
}: {
  clip: Base;
  plannerId: string;
  members: Member[];
  canClear: boolean;
}) {
  const { t } = usePrefs();
  const toast = useToast();
  const [pick, setPick] = useState(plannerId);
  const { run, pending, error } = useClipAction();

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-48">
          <MemberSelect
            label={t('clips.people.planner')}
            value={pick}
            onChange={setPick}
            members={members}
            emptyLabel={t('clips.people.plannerNone')}
            emptyDisabled={!canClear}
          />
        </div>
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
          {t('common.save')}
        </button>
      </div>
      <ErrorLine text={error} />
    </div>
  );
}

/**
 * Draft link, notes, due date -- and the length once the episode is ready
 * (before that, the "ready" step asks for it). The 5:00 cap shows inline and
 * holds the save back; the server refuses it regardless.
 */
export function WorkPanel({
  clip,
  duration,
  showLength,
  draftUrl,
  notes,
  dueDate,
}: {
  clip: Base;
  duration: number | null;
  showLength: boolean;
  draftUrl: string;
  notes: string;
  /** YYYY-MM-DD when a due date was set by hand, else ''. */
  dueDate: string;
}) {
  const { t } = usePrefs();
  const { length, setLength, problem } = useLength(duration);
  const [draft, setDraft] = useState(draftUrl);
  const [text, setText] = useState(notes);
  const [due, setDue] = useState(dueDate);
  const { run, pending, error } = useClipAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(
          () =>
            updateEpisodeWorkAction(
              clip.id,
              { ...(showLength ? { duration: length } : {}), draftUrl: draft, notes: text, dueDate: due },
              clip.rowVersion
            ),
          { done: t('common.saved') }
        );
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {showLength && <LengthField value={length} onChange={setLength} problem={problem} />}
        <label className="block text-sm">
          <span className="text-gray-700">{t('clips.work.due')}</span>
          <input type="date" className={`${FIELD} mt-1`} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.work.draft')}</span>
        <input
          type="url"
          name="draft-url"
          autoComplete="off"
          className={`${FIELD} mt-1`}
          placeholder="https://…"
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
      <button type="submit" className="btn btn-secondary" disabled={pending || (showLength && problem !== null)}>
        {pending ? t('common.saving') : t('common.save')}
      </button>
    </form>
  );
}

/** The post on the lab's Facebook Page (D6, D14): link, date, who posted. */
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
          name="post-url"
          autoComplete="off"
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
        <MemberSelect
          label={t('clips.publish.by')}
          value={who}
          onChange={setWho}
          members={members}
          emptyLabel={t('common.unspecified')}
          required
        />
      </div>
      <ErrorLine text={error} />
      <button type="submit" className={`btn ${isPublished ? 'btn-secondary' : 'btn-primary'}`} disabled={pending || !link.trim() || !day || !who}>
        {pending ? t('common.saving') : isPublished ? t('common.save') : t('clips.publish.submit')}
      </button>
    </form>
  );
}

/** Reword the episode. */
export function EpisodeTextPanel({ clip, title, details }: { clip: Base; title: string; details: string }) {
  const { t } = usePrefs();
  const [name, setName] = useState(title);
  const [body, setBody] = useState(details);
  const { run, pending, error } = useClipAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateEpisodeAction(clip.id, { title: name, details: body }, clip.rowVersion), { done: t('common.saved') });
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
      <button type="submit" className="btn btn-secondary" disabled={pending || !name.trim()}>
        {pending ? t('common.saving') : t('common.save')}
      </button>
    </form>
  );
}

/** Step back one stage, and admin's skip / bring back. */
export function StageExtras({
  clip,
  backTo,
  canSkip,
  canUnskip,
}: {
  clip: Base;
  backTo: { to: string; label: TranslationKey } | null;
  canSkip: boolean;
  canUnskip: boolean;
}) {
  const { t } = usePrefs();
  const ask = useConfirm();
  const { run, pending, error } = useClipAction();
  const go = (to: string) => run(() => setEpisodeStatusAction(clip.id, to, clip.rowVersion), { done: t('common.saved') });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {backTo && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => go(backTo.to)}>
            {t('clips.stage.backTo', { stage: t(backTo.label) })}
          </button>
        )}
        {canUnskip && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => go('planned')}>
            {t('clips.stage.unskip')}
          </button>
        )}
        {canSkip && (
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
      </div>
      <ErrorLine text={error} />
    </div>
  );
}

/** Remove the episode; back to its topic afterwards. */
export function DeleteEpisode({ clip, seriesId }: { clip: Base; seriesId: string }) {
  const { t } = usePrefs();
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const { run, pending, error } = useClipAction();

  return (
    <div>
      <button
        type="button"
        className="btn btn-danger-soft btn-sm"
        disabled={pending}
        onClick={async () => {
          if (!(await ask(t('clips.episode.confirmDelete'), { danger: true }))) return;
          run(() => deleteEpisodeAction(clip.id, clip.rowVersion), {
            after: () => {
              toast(t('clips.toast.episodeDeleted'));
              router.push(seriesId ? `/clips/series/${seriesId}` : '/clips');
            },
            refresh: false,
          });
        }}
      >
        {t('clips.episode.delete')}
      </button>
      <ErrorLine text={error} />
    </div>
  );
}
