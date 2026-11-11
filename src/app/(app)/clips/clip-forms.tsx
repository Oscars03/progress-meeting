'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useConfirm } from '@/lib/ui/confirm';
import { useToast } from '@/lib/ui/toast';
import { EVENT_COLORS } from '@/lib/event-colors';
import { MAX_EPISODES_AT_ONCE } from '@/lib/clips';
import type { TranslationKey } from '@/lib/ui/i18n';
import {
  addEpisodeAction,
  bookEpisodeAction,
  createOneOffAction,
  createSeriesAction,
  deleteSeriesAction,
  updateSeriesAction,
} from './actions';
import { ErrorLine, FIELD, useClipAction } from './use-clip-action';

export type WeekOption = { key: string; label: string };

const COLOR_KEY: Record<string, TranslationKey> = {
  rose: 'clips.color.rose',
  amber: 'clips.color.amber',
  emerald: 'clips.color.emerald',
  sky: 'clips.color.sky',
  violet: 'clips.color.violet',
  slate: 'clips.color.slate',
};

function ColorSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = usePrefs();
  return (
    <label className="block text-sm">
      <span className="text-gray-700">{t('clips.form.color')}</span>
      <select className={`${FIELD} mt-1`} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('clips.color.auto')}</option>
        {EVENT_COLORS.map((c) => (
          <option key={c} value={c}>
            {t(COLOR_KEY[c])}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The two ways to start a topic (D3, D18): a series with several episodes, or
 * a one-off -- a series of one -- that can be booked straight away.
 */
export function NewTopic({
  freeWeeks,
  presetWeek,
}: {
  freeWeeks: WeekOption[];
  /** Open the one-off form with this week chosen (the empty-week page). */
  presetWeek?: string;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState<'series' | 'oneoff' | null>(presetWeek ? 'oneoff' : null);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [color, setColor] = useState('');
  const [episodes, setEpisodes] = useState('');
  const [week, setWeek] = useState(presetWeek ?? '');
  const { run, pending, error, setError } = useClipAction();

  const reset = () => {
    setTitle('');
    setDetails('');
    setColor('');
    setEpisodes('');
    setWeek(presetWeek ?? '');
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (open === 'series') {
      const list = episodes.split('\n').map((s) => s.trim()).filter(Boolean);
      run(() => createSeriesAction({ title, description: details, color, episodes: list }), {
        done: t('clips.toast.seriesCreated'),
        after: (res) => {
          reset();
          setOpen(null);
          router.push(`/clips/series/${res.seriesId}`);
        },
        refresh: false,
      });
    } else {
      run(() => createOneOffAction({ title, details, color, week }), {
        after: (res) => {
          reset();
          setOpen(null);
          // Created either way; a booking that did not go through leaves it
          // queued, and the toast says why.
          toast(
            res.bookError
              ? t('clips.toast.createdNotBooked', { reason: t(res.bookError as TranslationKey) })
              : t('clips.toast.oneOffCreated')
          );
          router.push(`/clips/episode/${res.clipId}`);
        },
        refresh: false,
      });
    }
  };

  const toggle = (which: 'series' | 'oneoff') => {
    setError(null);
    setOpen(open === which ? null : which);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" aria-expanded={open === 'series'} onClick={() => toggle('series')}>
          {t('clips.newSeries')}
        </button>
        <button type="button" className="btn btn-secondary" aria-expanded={open === 'oneoff'} onClick={() => toggle('oneoff')}>
          {t('clips.newOneOff')}
        </button>
      </div>

      {open && (
        <form onSubmit={submit} className="p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
          <h3 className="font-semibold text-gray-900">
            {open === 'series' ? t('clips.form.seriesHeading') : t('clips.form.oneOffHeading')}
          </h3>
          <label className="block text-sm">
            <span className="text-gray-700">{t('clips.form.title')}</span>
            <input
              className={`${FIELD} mt-1`}
              value={title}
              maxLength={open === 'series' ? 120 : 200}
              required
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">
              {open === 'series' ? t('clips.form.description') : t('clips.form.details')}
            </span>
            <textarea
              className={`${FIELD} mt-1`}
              rows={3}
              maxLength={2000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </label>
          {open === 'series' ? (
            <label className="block text-sm">
              <span className="text-gray-700">{t('clips.form.episodes', { n: MAX_EPISODES_AT_ONCE })}</span>
              <textarea
                className={`${FIELD} mt-1`}
                rows={4}
                value={episodes}
                placeholder={t('clips.form.episodesPlaceholder')}
                onChange={(e) => setEpisodes(e.target.value)}
              />
            </label>
          ) : (
            <label className="block text-sm">
              <span className="text-gray-700">{t('clips.form.week')}</span>
              <select className={`${FIELD} mt-1`} value={week} onChange={(e) => setWeek(e.target.value)}>
                <option value="">{t('clips.form.weekNone')}</option>
                <option value="next">{t('clips.form.weekNext')}</option>
                {freeWeeks.map((w) => (
                  <option key={w.key} value={w.key}>
                    {w.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ColorSelect value={color} onChange={setColor} />
          <ErrorLine text={error} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary" disabled={pending || !title.trim()}>
              {pending ? t('common.saving') : t('clips.form.create')}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => { reset(); setOpen(null); }}>
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}
      {!open && <ErrorLine text={error} />}
    </div>
  );
}

/** Edit a series (anybody) and delete it (admin). */
export function SeriesEditor({
  series,
  isAdmin,
  episodeCount,
}: {
  series: { id: string; title: string; description: string; color: string; status: string; rowVersion: number };
  isAdmin: boolean;
  episodeCount: number;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(series.title);
  const [description, setDescription] = useState(series.description);
  const [color, setColor] = useState(series.color);
  const [status, setStatus] = useState(series.status || 'active');
  const { run, pending, error } = useClipAction();

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(() => updateSeriesAction(series.id, { title, description, color, status }, series.rowVersion), {
      done: t('common.saved'),
      after: () => setEditing(false),
    });
  };

  const remove = async () => {
    const ok = await ask(t('clips.series.confirmDelete', { n: episodeCount }), { danger: true });
    if (!ok) return;
    run(() => deleteSeriesAction(series.id, series.rowVersion), {
      after: () => {
        toast(t('clips.toast.seriesDeleted'));
        router.push('/clips');
      },
      refresh: false,
    });
  };

  if (!editing) {
    return (
      <div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>
            {t('clips.series.edit')}
          </button>
          {isAdmin && (
            <button type="button" className="btn btn-danger-soft btn-sm" disabled={pending} onClick={remove}>
              {t('clips.series.delete')}
            </button>
          )}
        </div>
        <ErrorLine text={error} />
      </div>
    );
  }

  return (
    <form onSubmit={save} className="w-full p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.form.title')}</span>
        <input className={`${FIELD} mt-1`} value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.form.description')}</span>
        <textarea className={`${FIELD} mt-1`} rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>
      <ColorSelect value={color} onChange={setColor} />
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.form.seriesStatus')}</span>
        <select className={`${FIELD} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">{t('clips.seriesStatus.active')}</option>
          <option value="finished">{t('clips.seriesStatus.finished')}</option>
          <option value="archived">{t('clips.seriesStatus.archived')}</option>
        </select>
      </label>
      <ErrorLine text={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending || !title.trim()}>
          {pending ? t('common.saving') : t('common.save')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

/** Add an episode to the end of a series' queue. Anybody (D17). */
export function EpisodeAdd({ seriesId }: { seriesId: string }) {
  const { t } = usePrefs();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const { run, pending, error } = useClipAction();

  if (!open) {
    return (
      <button type="button" className="btn btn-secondary" onClick={() => setOpen(true)}>
        {t('clips.episode.add')}
      </button>
    );
  }

  return (
    <form
      className="p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addEpisodeAction(seriesId, { title, details }), {
          done: t('clips.toast.episodeAdded'),
          after: () => {
            setTitle('');
            setDetails('');
            setOpen(false);
          },
        });
      }}
    >
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.form.episodeTitle')}</span>
        <input className={`${FIELD} mt-1`} value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.form.details')}</span>
        <textarea className={`${FIELD} mt-1`} rows={3} maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} />
      </label>
      <ErrorLine text={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending || !title.trim()}>
          {pending ? t('common.saving') : t('clips.episode.addSubmit')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

/**
 * Booking for an episode waiting in the queue: the next free week in one
 * tap, or a chosen one. Only free working weeks are offered; the server
 * checks again.
 */
export function QueueBooking({
  clipId,
  rowVersion,
  nextFree,
  freeWeeks,
}: {
  clipId: string;
  rowVersion: number;
  nextFree: WeekOption | null;
  freeWeeks: WeekOption[];
}) {
  const { t } = usePrefs();
  const [week, setWeek] = useState('');
  const { run, pending, error } = useClipAction();

  return (
    <div className="space-y-2">
      {nextFree ? (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={pending}
          onClick={() => run(() => bookEpisodeAction(clipId, rowVersion, 'next'), { done: t('clips.toast.booked') })}
        >
          {t('clips.book.next', { week: nextFree.label })}
        </button>
      ) : (
        <p className="text-sm text-amber-800">{t('clips.book.noneFree')}</p>
      )}
      {freeWeeks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor={`pick-${clipId}`}>
            {t('clips.book.pick')}
          </label>
          <select id={`pick-${clipId}`} className={`${FIELD} w-auto max-w-full`} value={week} onChange={(e) => setWeek(e.target.value)}>
            <option value="">{t('clips.book.pick')}</option>
            {freeWeeks.map((w) => (
              <option key={w.key} value={w.key}>
                {w.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={pending || !week}
            onClick={() => run(() => bookEpisodeAction(clipId, rowVersion, week), { done: t('clips.toast.booked') })}
          >
            {t('clips.book.submit')}
          </button>
        </div>
      )}
      <ErrorLine text={error} />
    </div>
  );
}

/** On an empty week: put one of the queued episodes into it. */
export function BookIntoWeek({
  week,
  queued,
}: {
  week: string;
  queued: { id: string; rowVersion: number; label: string }[];
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [pick, setPick] = useState('');
  const { run, pending, error } = useClipAction();
  const chosen = queued.find((q) => q.id === pick);

  if (queued.length === 0) return <p className="text-sm text-gray-500">{t('clips.week.noQueued')}</p>;

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.week.pickQueued')}</span>
        <select className={`${FIELD} mt-1`} value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">{t('common.unspecified')}</option>
          {queued.map((q) => (
            <option key={q.id} value={q.id}>
              {q.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending || !chosen}
        onClick={() =>
          chosen &&
          run(() => bookEpisodeAction(chosen.id, chosen.rowVersion, week), {
            done: t('clips.toast.booked'),
            after: () => router.push(`/clips/episode/${chosen.id}`),
            refresh: false,
          })
        }
      >
        {t('clips.week.bookHere')}
      </button>
      <ErrorLine text={error} />
    </div>
  );
}
