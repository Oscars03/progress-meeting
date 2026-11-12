'use client';

import { useId, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useConfirm } from '@/lib/ui/confirm';
import { useToast } from '@/lib/ui/toast';
import { Presence } from '@/lib/ui/presence';
import { ModalScope } from '@/lib/ui/modal';
import { deleteEpisodeAction, updateEpisodeAction } from './actions';
import { ErrorLine, FIELD, useClipAction } from './use-clip-action';

/**
 * The episode's edit (pencil) and delete (trash) icons: in the episode page's
 * header and on each row of its topic's list. The page decides who sees each
 * one with `episodeEditProblem` / `episodeDeleteProblem` from lib/clips.ts --
 * the same rules the actions refuse with -- so an icon is never a dead end.
 *
 * `children`, when given, is the row the icons sit beside (the link to the
 * episode). It is a sibling of the buttons, never their parent, so a tap on
 * an icon does not also open the episode.
 */

type Episode = { id: string; rowVersion: number; no: number; title: string; details: string };

/** Same drawing style as the nav icons in app-nav.tsx: 24px grid, 2px stroke. */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const ICON_BUTTON = 'btn btn-ghost h-11 w-11 p-0';

export function EpisodeActions({
  episode,
  canEdit,
  canDelete,
  afterDelete,
  children,
}: {
  episode: Episode;
  canEdit: boolean;
  canDelete: boolean;
  /** Where to go once it is deleted; stays (and reloads) when absent. */
  afterDelete?: string;
  children?: ReactNode;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const ask = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const removal = useClipAction();

  const remove = async () => {
    const question = t('clips.episode.confirmDelete', { n: episode.no, title: episode.title });
    if (!(await ask(question, { danger: true }))) return;
    removal.run(() => deleteEpisodeAction(episode.id, episode.rowVersion), {
      after: () => {
        toast(t('clips.toast.episodeDeleted'));
        if (afterDelete) router.push(afterDelete);
        else router.refresh();
      },
      refresh: false,
    });
  };

  const icons =
    canEdit || canDelete ? (
      <div className="flex shrink-0 items-center gap-1">
        {canEdit && (
          <button
            type="button"
            className={ICON_BUTTON}
            aria-label={t('clips.episode.edit', { n: episode.no })}
            title={t('clips.episode.edit', { n: episode.no })}
            aria-haspopup="dialog"
            onClick={() => setEditing(true)}
          >
            <Glyph>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
            </Glyph>
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            className={`${ICON_BUTTON} text-[var(--btn-danger-ink)] hover:bg-[var(--btn-danger-soft-hover)]`}
            aria-label={t('clips.episode.delete', { n: episode.no })}
            title={t('clips.episode.delete', { n: episode.no })}
            disabled={removal.pending}
            onClick={remove}
          >
            <Glyph>
              <path d="M3 6h18" />
              <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
            </Glyph>
          </button>
        )}
      </div>
    ) : null;

  return (
    <>
      {children ? (
        <div className="flex items-start">
          {children}
          {icons && <div className="py-1.5 pr-2 sm:pr-3">{icons}</div>}
        </div>
      ) : (
        icons
      )}
      {removal.error && (
        <div className={children ? 'px-4 pb-3 sm:px-5' : 'basis-full'}>
          <ErrorLine text={removal.error} />
        </div>
      )}
      <Presence value={editing}>{() => <EditDialog episode={episode} onClose={() => setEditing(false)} />}</Presence>
    </>
  );
}

/** Reword the episode: its title and details, nothing else. */
function EditDialog({ episode, onClose }: { episode: Episode; onClose: () => void }) {
  const { t } = usePrefs();
  const headingId = useId();
  const [name, setName] = useState(episode.title);
  const [body, setBody] = useState(episode.details);
  const { run, pending, error } = useClipAction();

  return (
    <ModalScope onClose={onClose}>
      <div
        className="motion-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <form
          className="motion-dialog w-full max-w-md max-h-[90dvh] overflow-y-auto space-y-4 rounded-xl bg-white p-4 shadow-xl sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateEpisodeAction(episode.id, { title: name, details: body }, episode.rowVersion), {
              done: t('common.saved'),
              after: onClose,
            });
          }}
        >
          <h3 id={headingId} className="text-lg font-semibold text-gray-900">
            {t('clips.episode.editHeading', { n: episode.no })}
          </h3>
          <label className="block text-sm">
            <span className="text-gray-700">{t('clips.form.episodeTitle')}</span>
            <input
              name="episode-title"
              autoComplete="off"
              className={`${FIELD} mt-1`}
              value={name}
              maxLength={200}
              required
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">{t('clips.form.details')}</span>
            <textarea
              name="episode-details"
              className={`${FIELD} mt-1`}
              rows={4}
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <ErrorLine text={error} />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending || !name.trim()}>
              {pending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </ModalScope>
  );
}
