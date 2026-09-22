'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import type { ActionResult } from '@/lib/action-result';
import { daysBetween, elapsedPct, formatDay } from '@/lib/tracker';
import { deleteTask, saveSubtasks, setTaskProgress, updateTaskStatus } from './actions';
import { TASK_STATUSES } from './statuses';
import type { TrackerPerson, TrackerRound, TrackerRow } from './tracker-model';
import { Avatar, CloseIcon, Tag } from './tracker-ui';

/**
 * Run an action from a click, and report what came back.
 *
 * Every write on this page answers either with a fresh render (revalidatePath)
 * or with a message key; this keeps that in one place so no button forgets to
 * say why it was refused.
 */
function useAction() {
  const { t } = usePrefs();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (work: () => Promise<ActionResult>, then?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        const res = await work();
        if (!res.ok) {
          setError(t(res.error, res.vars));
          return;
        }
        router.refresh();
        then?.();
      } catch {
        setError(t('error.generic'));
      }
    });
  };

  return { pending, error, run };
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="mt-2 p-2.5 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
      {text}
    </p>
  );
}

/** A project's checklist, ticked and added to in place. Shared with the Subtasks tab. */
export function Checklist({ row }: { row: TrackerRow }) {
  const { t } = usePrefs();
  const { pending, error, run } = useAction();
  const [text, setText] = useState('');

  const save = (items: TrackerRow['subtasks'], then?: () => void) =>
    run(() => saveSubtasks(row.id, items, row.rowVersion), then);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const title = text.trim();
    if (!title) return;
    save([...row.subtasks, { id: '', title, done: false }], () => setText(''));
  };

  return (
    <div>
      {row.subtasks.length === 0 ? (
        <p className="text-sm text-gray-500">{t('tracker.noSubtasks')}</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {row.subtasks.map((s) => (
            <li key={s.id} className="flex items-center gap-2.5 py-1.5 text-sm">
              <input
                type="checkbox"
                className="trk-check h-4 w-4 shrink-0"
                checked={s.done}
                disabled={!row.can.work || pending}
                onChange={(e) =>
                  save(row.subtasks.map((x) => (x.id === s.id ? { ...x, done: e.target.checked } : x)))
                }
                aria-label={t('tracker.subtaskDone', { title: s.title })}
              />
              <span className={`flex-1 min-w-0 ${s.done ? 'line-through text-gray-400' : ''}`}>{s.title}</span>
              {row.can.work && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => save(row.subtasks.filter((x) => x.id !== s.id))}
                  className="shrink-0 p-1 rounded text-gray-400 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-50"
                  aria-label={t('tracker.removeSubtask', { title: s.title })}
                >
                  <CloseIcon />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {row.can.work && (
        <form onSubmit={add} className="flex gap-2 mt-2">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('tracker.addSubtask')}
            aria-label={t('tracker.addSubtask')}
            maxLength={200}
            className="flex-1 min-w-0 px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white"
          />
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {t('tracker.add')}
          </button>
        </form>
      )}
      <ErrorLine text={error} />
    </div>
  );
}

export default function ProjectDrawer({
  row,
  rounds,
  person,
  today,
  onClose,
  onEdit,
  onDeleted,
}: {
  row: TrackerRow;
  rounds: TrackerRound[];
  person: (id: string) => TrackerPerson;
  today: string;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: (title: string) => void;
}) {
  const { t, locale } = usePrefs();
  const { pending, error, run } = useAction();
  const [draft, setDraft] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const round = rounds.find((r) => r.id === row.roundId);
  const started = daysBetween(today, row.start) <= 0;
  const elapsed = started ? elapsedPct(row.start, row.due, today) : null;
  const value = draft ?? row.progress;
  const tone = row.status !== 'done' && !started ? 'future' : row.health;
  const owner = person(row.ownerId);

  let period = formatDay(row.start, locale);
  if (row.due) period += ` – ${formatDay(row.due, locale)}`;
  let left = '';
  if (row.status === 'done') left = t('tracker.health.done');
  else if (row.due) {
    const n = daysBetween(today, row.due);
    left = n < 0 ? t('tracker.overdueBy', { n: -n }) : t('tracker.daysLeft', { n });
  }

  return (
    <>
      <div className="trk-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="trk-drawer" role="dialog" aria-modal="true" aria-labelledby="trk-drawer-title">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Tag tag={row.tag} />
            <h3 id="trk-drawer-title" className="text-lg font-semibold leading-snug mt-1">
              {row.title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {round ? round.name : t('tracker.unsorted')} · {period}
              {left && ` · ${left}`}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label={t('weekly.close')}
          >
            <CloseIcon />
          </button>
        </div>

        <section className="trk-sec">
          <h4 className="trk-sec-title">{t('tasks.assignees')}</h4>
          {row.assigneeIds.length > 0 ? (
            <div className="flex flex-col gap-2">
              {row.assigneeIds.map((id) => (
                <span key={id} className="flex items-center gap-2.5 font-medium">
                  <Avatar person={person(id)} large />
                  {person(id).name}
                </span>
              ))}
            </div>
          ) : (
            <span className="trk-nobody">{t('tracker.nobody')}</span>
          )}
          <p className="text-xs text-gray-500 mt-2">
            {owner.role === 'professor' || owner.role === 'admin'
              ? t('tracker.assignedBy', { name: owner.name })
              : t('tracker.addedBy', { name: owner.name })}
            {row.assignerId && row.assignerId !== row.ownerId && ` · ${t('tracker.askedBy', { name: person(row.assignerId).name })}`}
          </p>
        </section>

        <section className="trk-sec">
          <h4 className="trk-sec-title">{t('tracker.col.progress')}</h4>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className={`trk-chip-health trk-h-${tone}`}>
              {tone === 'future'
                ? t('tracker.startsOn', { date: formatDay(row.start, locale) })
                : t(`tracker.health.${row.health}`)}
            </span>
            {row.can.work ? (
              <select
                value={row.status}
                disabled={pending}
                onChange={(e) => run(() => updateTaskStatus(row.id, e.target.value, row.rowVersion))}
                aria-label={t('tasks.changeStatusOf', { title: row.title })}
                className="text-xs border border-gray-300 rounded-md px-2 py-1 bg-white"
              >
                {TASK_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`tasks.status.${s}`)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="trk-pill" data-status={row.status}>
                {t(`tasks.status.${row.status}`)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={value}
              disabled={!row.can.work || pending}
              onChange={(e) => setDraft(Number(e.target.value))}
              aria-label={t('tracker.col.progress')}
              className="trk-range flex-1"
            />
            <b className="trk-mono w-12 text-right">{value}%</b>
          </div>
          {row.can.work && draft !== null && draft !== row.progress && (
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => setTaskProgress(row.id, draft, row.rowVersion), () => setDraft(null))}
                className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {pending ? t('common.saving') : t('tracker.saveProgress')}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setDraft(null)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-2">
            {elapsed !== null && `${t('tracker.elapsed', { pct: elapsed })} · `}
            {row.lastUpdate
              ? t('tracker.lastUpdate', { date: formatDay(row.lastUpdate, locale) })
              : t('tracker.neverUpdated')}
            {!row.can.work && ` · ${t('tracker.onlyTheirs')}`}
          </p>
        </section>

        <section className="trk-sec">
          <h4 className="trk-sec-title">
            {t('tracker.view.subtasks')}
            {row.subtasks.length > 0 &&
              ` ${row.subtasks.filter((s) => s.done).length}/${row.subtasks.length}`}
          </h4>
          <Checklist row={row} />
        </section>

        {row.details && (
          <section className="trk-sec">
            <h4 className="trk-sec-title">{t('tasks.details')}</h4>
            <p className="text-sm whitespace-pre-wrap">{row.details}</p>
          </section>
        )}

        <section className="trk-sec">
          <h4 className="trk-sec-title">{t('weekly.title')}</h4>
          {row.log.length === 0 ? (
            <p className="text-sm text-gray-500">{t('tracker.noReports')}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {row.log.map((l) => (
                <li key={l.week} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 text-sm">
                  <span className="trk-mono text-xs text-gray-400 pt-0.5">
                    {l.week.replace(/^\d{4}-/, '')} · {l.pct}%
                  </span>
                  <span>{l.summary}</span>
                </li>
              ))}
            </ul>
          )}
          {row.can.work && row.status !== 'done' && (
            <Link
              href="/tasks/weekly"
              className="inline-block mt-3 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
            >
              {t('tracker.writeReport')}
            </Link>
          )}
        </section>

        {(row.can.edit || row.can.remove) && (
          <div className="flex flex-wrap gap-2 mt-5">
            {row.can.edit && (
              <button
                type="button"
                onClick={onEdit}
                className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                {t('tracker.edit')}
              </button>
            )}
            {row.can.remove && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
              >
                {t('common.delete')}
              </button>
            )}
          </div>
        )}
        {confirming && (
          <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
            <p>{t('tasks.confirmDelete', { title: row.title })}</p>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => deleteTask(row.id, row.rowVersion), () => onDeleted(row.title))}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t('tracker.deleteNow')}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="px-3 py-1.5 rounded-lg border border-red-200 hover:bg-red-100"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
        <ErrorLine text={error} />
      </aside>
    </>
  );
}
