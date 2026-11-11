'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useConfirm } from '@/lib/ui/confirm';
import { useToast } from '@/lib/ui/toast';
import { EVENT_COLORS } from '@/lib/event-colors';
import { MAX_EPISODES_AT_ONCE } from '@/lib/clips';
import type { TranslationKey } from '@/lib/ui/i18n';
import { addEpisodeAction, createSeriesAction, deleteSeriesAction, updateSeriesAction } from './actions';
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

/** "Book into the next free weeks" -- on by default, so a new episode lands on the calendar in one tap. */
function BookBox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { t } = usePrefs();
  return (
    <label className="flex items-start gap-2 text-sm text-gray-700">
      <input type="checkbox" className="mt-1 h-4 w-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{t('clips.form.book')}</span>
    </label>
  );
}

/** What happened to the booking, said once in the toast. */
function bookedToast(t: (k: TranslationKey, v?: Record<string, string | number>) => string, added: number, booked: number, asked: boolean): string {
  if (!asked) return t('clips.toast.created', { n: added });
  if (booked === added) return t('clips.toast.createdBooked', { n: added });
  return t('clips.toast.createdSomeQueued', { n: added, queued: added - booked });
}

/**
 * Start a clip topic: one form. Episode titles one per line; none makes a
 * one-off (a series of one). Description and colour wait under "more".
 */
export function NewTopic() {
  const { t } = usePrefs();
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [episodes, setEpisodes] = useState('');
  const [book, setBook] = useState(true);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('');
  const { run, pending, error, setError } = useClipAction();

  const close = () => {
    setTitle('');
    setEpisodes('');
    setBook(true);
    setDescription('');
    setColor('');
    setError(null);
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {t('clips.newTopic')}
      </button>
    );
  }

  return (
    <form
      className="p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const list = episodes.split('\n').map((s) => s.trim()).filter(Boolean);
        run(() => createSeriesAction({ title, description, color, episodes: list, book }), {
          after: (res) => {
            toast(bookedToast(t, res.added, res.booked, book));
            close();
            router.push(`/clips/series/${res.seriesId}`);
          },
          refresh: false,
        });
      }}
    >
      <h3 className="font-semibold text-gray-900">{t('clips.form.topicHeading')}</h3>
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.form.title')}</span>
        <input
          name="title"
          autoComplete="off"
          className={`${FIELD} mt-1`}
          value={title}
          maxLength={120}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.form.episodes', { n: MAX_EPISODES_AT_ONCE })}</span>
        <textarea
          name="episodes"
          className={`${FIELD} mt-1`}
          rows={4}
          value={episodes}
          placeholder={t('clips.form.episodesPlaceholder')}
          onChange={(e) => setEpisodes(e.target.value)}
        />
        <span className="block mt-1 text-xs text-gray-500">{t('clips.form.episodesHelp')}</span>
      </label>
      <BookBox checked={book} onChange={setBook} />
      <details className="text-sm">
        <summary className="cursor-pointer py-2 text-gray-600">{t('clips.form.moreFields')}</summary>
        <div className="space-y-3 pt-2">
          <label className="block">
            <span className="text-gray-700">{t('clips.form.description')}</span>
            <textarea
              className={`${FIELD} mt-1`}
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <ColorSelect value={color} onChange={setColor} />
        </div>
      </details>
      <ErrorLine text={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending || !title.trim()}>
          {pending ? t('common.saving') : t('clips.form.create')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={close}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}

/** Edit a series (anybody) and delete it (admin). Lives under "more" on the series page. */
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
  const [title, setTitle] = useState(series.title);
  const [description, setDescription] = useState(series.description);
  const [color, setColor] = useState(series.color);
  const [status, setStatus] = useState(series.status || 'active');
  const { run, pending, error } = useClipAction();

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

  return (
    <div className="space-y-4">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => updateSeriesAction(series.id, { title, description, color, status }, series.rowVersion), {
            done: t('common.saved'),
          });
        }}
      >
        <label className="block text-sm">
          <span className="text-gray-700">{t('clips.form.title')}</span>
          <input className={`${FIELD} mt-1`} value={title} maxLength={120} required onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">{t('clips.form.description')}</span>
          <textarea className={`${FIELD} mt-1`} rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <ColorSelect value={color} onChange={setColor} />
          <label className="block text-sm">
            <span className="text-gray-700">{t('clips.form.seriesStatus')}</span>
            <select className={`${FIELD} mt-1`} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">{t('clips.seriesStatus.active')}</option>
              <option value="finished">{t('clips.seriesStatus.finished')}</option>
              <option value="archived">{t('clips.seriesStatus.archived')}</option>
            </select>
          </label>
        </div>
        <button type="submit" className="btn btn-secondary" disabled={pending || !title.trim()}>
          {pending ? t('common.saving') : t('common.save')}
        </button>
      </form>
      {isAdmin && (
        <div className="pt-4 border-t border-gray-100">
          <button type="button" className="btn btn-danger-soft btn-sm" disabled={pending} onClick={remove}>
            {t('clips.series.delete')}
          </button>
        </div>
      )}
      <ErrorLine text={error} />
    </div>
  );
}

/** Add an episode at the end of a series, booked into the next free week unless unticked. Anybody (D17). */
export function EpisodeAdd({ seriesId }: { seriesId: string }) {
  const { t } = usePrefs();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [book, setBook] = useState(true);
  const { run, pending, error, setError } = useClipAction();

  const close = () => {
    setTitle('');
    setBook(true);
    setError(null);
    setOpen(false);
  };

  if (!open) {
    return (
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
        {t('clips.episode.add')}
      </button>
    );
  }

  return (
    <form
      className="p-4 sm:p-5 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addEpisodeAction(seriesId, { title, book }), {
          after: (res) => {
            toast(bookedToast(t, 1, res.booked ? 1 : 0, book));
            close();
          },
        });
      }}
    >
      <label className="block text-sm">
        <span className="text-gray-700">{t('clips.form.episodeTitle')}</span>
        <input
          name="episode-title"
          autoComplete="off"
          className={`${FIELD} mt-1`}
          value={title}
          maxLength={200}
          required
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <BookBox checked={book} onChange={setBook} />
      <ErrorLine text={error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={pending || !title.trim()}>
          {pending ? t('common.saving') : t('clips.episode.addSubmit')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={close}>
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
