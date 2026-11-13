'use client';

import { useState } from 'react';
import { usePrefs } from '@/lib/ui/prefs';
import { useConfirm } from '@/lib/ui/confirm';
import { MAX_DURATION_SEC, formatDuration, parseDuration } from '@/lib/clips';
import type { TranslationKey } from '@/lib/ui/i18n';
import {
  bookEpisodeAction,
  moveEpisodeAction,
  publishEpisodeAction,
  setEpisodeStatusAction,
  swapEpisodesAction,
  unbookEpisodeAction,
  updateEpisodeLengthAction,
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
  required = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  members: Member[];
  emptyLabel: string;
  required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="text-gray-700">{label}</span>
      <select className={`${FIELD} mt-1`} value={value} required={required} onChange={(e) => onChange(e.target.value)}>
        <option value="">{emptyLabel}</option>
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
 * book a week, start production, mark it ready (with its length), or record
 * the Facebook post. The server checks every step again.
 */
export function NextStep({
  clip,
  step,
  nextFree,
  members,
  duration,
  publish,
}: {
  clip: Base;
  step: 'book' | 'start' | 'ready' | 'publish';
  /** For `book`: the week a tap would take, or null when none is free. */
  nextFree: WeekOption | null;
  members: Member[];
  duration: number | null;
  /** For `publish`: the defaults. */
  publish: { date: string; postedBy: string };
}) {
  const { t } = usePrefs();
  const { run, pending, error } = useClipAction();
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

  if (step === 'start') {
    return (
      <div className="space-y-2">
        <ErrorLine text={error} />
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() => run(() => setEpisodeStatusAction(clip.id, 'in_production', clip.rowVersion), { done: t('clips.toast.started') })}
        >
          {pending ? t('common.saving') : t('clips.stage.toInProduction')}
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => setEpisodeStatusAction(clip.id, 'ready', clip.rowVersion, { duration: length }), {
          done: t('clips.toast.ready'),
        });
      }}
    >
      <LengthField value={length} onChange={setLength} problem={problem} required />
      <ErrorLine text={error} />
      <button type="submit" className="btn btn-primary" disabled={pending || !length.trim() || problem !== null}>
        {pending ? t('common.saving') : t('clips.stage.toReady')}
      </button>
    </form>
  );
}

/** A week another episode holds, that this one may trade with (swapProblem). */
export type SwapOption = WeekOption & {
  other: { id: string; rowVersion: number; title: string; inWork: boolean };
};

/**
 * Choose a week by hand, move to another, swap with the episode in a taken
 * one, or take it out of its week -- shown on the episode page itself, not
 * folded away. One list, in week order: free weeks to move into, and the
 * taken weeks a swap is allowed with, labelled as such. The server checks
 * every choice again.
 */
export function WeekPanel({
  clip,
  freeWeeks,
  swaps = [],
}: {
  clip: Base & { week: string; weekLabel: string; title: string; inWork: boolean };
  freeWeeks: WeekOption[];
  /** Only for a booked episode. */
  swaps?: SwapOption[];
}) {
  const { t } = usePrefs();
  const ask = useConfirm();
  const [week, setWeek] = useState('');
  const { run, pending, error } = useClipAction();

  const swapByWeek = new Map(swaps.map((s) => [s.key, s]));
  const options = [...freeWeeks.map((w) => ({ key: w.key, label: w.label })), ...swaps.map((s) => ({
    key: s.key,
    label: t('clips.swap.option', { week: s.label, title: s.other.title }),
  }))].sort((a, b) => a.key.localeCompare(b.key));
  const swap = clip.week ? swapByWeek.get(week) : undefined;

  const place = async () => {
    if (swap) {
      const vars = { a: clip.title, b: swap.other.title, weekA: clip.weekLabel, weekB: swap.label };
      const ok = await ask(t(clip.inWork || swap.other.inWork ? 'clips.swap.confirmInWork' : 'clips.swap.confirm', vars), {
        title: t('clips.swap.confirmTitle'),
        confirmLabel: t('clips.swap.confirmLabel'),
      });
      if (!ok) return;
      run(() => swapEpisodesAction(clip.id, clip.rowVersion, swap.other.id, swap.other.rowVersion), {
        done: t('clips.toast.swapped'),
      });
      return;
    }
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
    <div className="space-y-3">
      {options.length === 0 ? (
        <p className="text-sm text-gray-500">{t('clips.book.noneFree')}</p>
      ) : (
        <>
          <label className="sr-only" htmlFor={`week-${clip.id}`}>
            {t('clips.book.pick')}
          </label>
          <select id={`week-${clip.id}`} name="week" className={FIELD} value={week} onChange={(e) => setWeek(e.target.value)}>
            <option value="">{t('clips.book.pick')}</option>
            {options.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        {options.length > 0 && (
          <button type="button" className="btn btn-secondary max-w-full truncate" disabled={pending || !week} onClick={place}>
            {swap
              ? t('clips.swap.submit', { title: swap.other.title })
              : t(clip.week ? 'clips.move.submit' : 'clips.book.submit')}
          </button>
        )}
        {clip.week && (
          <button type="button" className="btn btn-secondary" disabled={pending} onClick={unbook}>
            {t('clips.unbook.submit')}
          </button>
        )}
      </div>
      <ErrorLine text={error} />
    </div>
  );
}

/**
 * Correct the length once the episode is ready (before that, the "ready"
 * step asks for it). The 5:00 cap shows inline and holds the save back; the
 * server refuses it regardless.
 */
export function LengthPanel({ clip, duration }: { clip: Base; duration: number | null }) {
  const { t } = usePrefs();
  const { length, setLength, problem } = useLength(duration);
  const { run, pending, error } = useClipAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => updateEpisodeLengthAction(clip.id, length, clip.rowVersion), { done: t('common.saved') });
      }}
    >
      <LengthField value={length} onChange={setLength} problem={problem} required />
      <ErrorLine text={error} />
      <button type="submit" className="btn btn-secondary" disabled={pending || !length.trim() || problem !== null}>
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
