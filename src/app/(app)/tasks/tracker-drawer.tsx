'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useModal } from '@/lib/ui/modal';
import type { ActionResult } from '@/lib/action-result';
import { daysBetween, elapsedPct, formatDay, type Subtask } from '@/lib/tracker';
import { deleteTask, saveSubtasks, setTaskProgress, updateTaskDetails, updateTaskStatus } from './actions';
import { TASK_STATUSES } from './statuses';
import type { TrackerPerson, TrackerRound, TrackerRow } from './tracker-model';
import { Avatar, CloseIcon, Tag } from './tracker-ui';

/** One press each: most updates are one of these, and a slider made every one a drag and a save. */
const PROGRESS_STEPS = [0, 25, 50, 75, 100];

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

type LineDraft = { title: string; start: string; due: string };
const EMPTY_LINE: LineDraft = { title: '', start: '', due: '' };

const dateField = 'px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900';

/** A start and an end, as two date fields side by side. */
function DateRange({
  value,
  onChange,
  disabled,
}: {
  value: { start: string; due: string };
  onChange: (next: { start: string; due: string }) => void;
  disabled?: boolean;
}) {
  const { t } = usePrefs();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        {t('tracker.checklist.start')}
        <input
          type="date"
          value={value.start}
          max={value.due || undefined}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, start: e.target.value })}
          className={dateField}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-gray-600">
        {t('tracker.checklist.end')}
        <input
          type="date"
          value={value.due}
          min={value.start || undefined}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, due: e.target.value })}
          className={dateField}
        />
      </label>
    </div>
  );
}

/**
 * A project's checklist, ticked, dated and edited in place. Shared with the
 * Subtasks tab.
 *
 * Each line is a row big enough to press: the box ticks it, pressing the
 * words opens it for editing -- its name and its start and end -- right where
 * it is, rather than in a form somewhere else.
 */
export function Checklist({ row, today }: { row: TrackerRow; today?: string }) {
  const { t, locale } = usePrefs();
  const { pending, error, run } = useAction();
  const [adding, setAdding] = useState<LineDraft>(EMPTY_LINE);
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LineDraft>(EMPTY_LINE);

  const can = row.can.work;
  const items = row.subtasks;
  const done = items.filter((s) => s.done).length;
  const pct = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

  const save = (next: Subtask[], then?: () => void) =>
    run(() => saveSubtasks(row.id, next, row.rowVersion), then);

  const startEdit = (s: Subtask) => {
    if (!can) return;
    setEditId(s.id);
    setDraft({ title: s.title, start: s.start, due: s.due });
  };

  const commitEdit = (e: React.FormEvent) => {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    save(
      items.map((x) => (x.id === editId ? { ...x, title, start: draft.start, due: draft.due } : x)),
      () => setEditId(null)
    );
  };

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const title = adding.title.trim();
    if (!title) return;
    save([...items, { id: '', title, done: false, start: adding.start, due: adding.due }], () =>
      setAdding(EMPTY_LINE)
    );
  };

  const span = (s: Subtask) => {
    if (s.start && s.due) return `${formatDay(s.start, locale)} – ${formatDay(s.due, locale)}`;
    if (s.due) return `${t('tracker.checklist.until')} ${formatDay(s.due, locale)}`;
    if (s.start) return `${t('tracker.checklist.from')} ${formatDay(s.start, locale)}`;
    return '';
  };

  return (
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{t('tracker.noSubtasks')}</p>
      ) : (
        <>
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <span className="trk-mono text-xs text-gray-600">
              {done}/{items.length}
            </span>
          </div>
          <ul className="space-y-1.5">
            {items.map((s) => {
              if (s.id === editId) {
                return (
                  <li key={s.id} className="rounded-xl border border-blue-600 p-3">
                    <form onSubmit={commitEdit} className="space-y-2.5">
                      <input
                        type="text"
                        value={draft.title}
                        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                        maxLength={200}
                        autoFocus
                        aria-label={t('tracker.checklist.edit', { title: s.title })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                      />
                      <DateRange
                        value={draft}
                        onChange={(next) => setDraft({ ...draft, ...next })}
                        disabled={pending}
                      />
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={pending || !draft.title.trim()}
                          className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          {pending ? t('common.saving') : t('common.save')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditId(null)}
                          className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </form>
                  </li>
                );
              }

              const when = span(s);
              const late = !s.done && Boolean(today) && Boolean(s.due) && s.due < (today ?? '');
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    className="trk-check h-5 w-5 shrink-0"
                    checked={s.done}
                    disabled={!can || pending}
                    onChange={(e) =>
                      save(items.map((x) => (x.id === s.id ? { ...x, done: e.target.checked } : x)))
                    }
                    aria-label={t('tracker.subtaskDone', { title: s.title })}
                  />
                  <button
                    type="button"
                    disabled={!can}
                    onClick={() => startEdit(s)}
                    className="flex-1 min-w-0 text-left disabled:cursor-default"
                    aria-label={can ? t('tracker.checklist.edit', { title: s.title }) : undefined}
                  >
                    <span className={`block text-sm ${s.done ? 'line-through text-gray-500' : 'text-gray-900'}`}>
                      {s.title}
                    </span>
                    {when ? (
                      <span className={`block text-xs tabular-nums ${late ? 'text-red-600' : 'text-gray-500'}`}>
                        {when}
                      </span>
                    ) : (
                      can && <span className="block text-xs text-blue-600">{t('tracker.checklist.addDates')}</span>
                    )}
                  </button>
                  {can && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => save(items.filter((x) => x.id !== s.id))}
                      className="shrink-0 p-1.5 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-50"
                      aria-label={t('tracker.removeSubtask', { title: s.title })}
                    >
                      <CloseIcon />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      {can && (
        <form onSubmit={add} className="rounded-xl border border-dashed border-gray-300 p-3 space-y-2.5">
          <div className="flex gap-2">
            <input
              type="text"
              value={adding.title}
              onChange={(e) => setAdding({ ...adding, title: e.target.value })}
              placeholder={t('tracker.addSubtask')}
              aria-label={t('tracker.addSubtask')}
              maxLength={200}
              className="flex-1 min-w-0 px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
            />
            <button
              type="submit"
              disabled={pending || !adding.title.trim()}
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {t('tracker.add')}
            </button>
          </div>
          <DateRange value={adding} onChange={(next) => setAdding({ ...adding, ...next })} disabled={pending} />
        </form>
      )}
      <ErrorLine text={error} />
    </div>
  );
}

/** One of the figures across the top of the panel. */
function Stat({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'late' }) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div
        className={`mt-0.5 text-2xl font-semibold tabular-nums leading-tight ${tone === 'late' ? 'text-red-600' : 'text-gray-900'}`}
      >
        {children}
      </div>
    </div>
  );
}

export default function ProjectDrawer({
  row,
  parent,
  subs,
  rounds,
  person,
  today,
  onClose,
  onEdit,
  onDeleted,
  onOpen,
  onAddSub,
}: {
  row: TrackerRow;
  /** The project this is a sub-project of, when it is one. */
  parent: TrackerRow | null;
  /** Its sub-projects, when it is a project. */
  subs: TrackerRow[];
  rounds: TrackerRound[];
  person: (id: string) => TrackerPerson;
  today: string;
  onClose: () => void;
  onEdit: () => void;
  onDeleted: (title: string) => void;
  /** Show another project in this panel instead. */
  onOpen: (id: string) => void;
  onAddSub: () => void;
}) {
  const { t, locale } = usePrefs();
  const { pending, error, run } = useAction();
  const [draft, setDraft] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const drawerRef = useRef<HTMLElement>(null);
  useModal(drawerRef, true, onClose);

  // A sub-project sits in its project's round.
  const round = rounds.find((r) => r.id === (parent ?? row).roundId);
  const started = daysBetween(today, row.start) <= 0;
  const elapsed = started ? elapsedPct(row.start, row.due, today) : null;
  const value = draft ?? row.progress;
  const tone = row.status !== 'done' && !started ? 'future' : row.health;
  const owner = person(row.ownerId);
  const checklistDone = row.subtasks.filter((s) => s.done).length;

  let left = '—';
  let late = false;
  if (row.status === 'done') left = t('tracker.health.done');
  else if (row.due) {
    const n = daysBetween(today, row.due);
    late = n < 0;
    left = late ? t('tracker.overdueBy', { n: -n }) : t('tracker.daysLeft', { n });
  }

  // The project's own dates, changed right here. Saved on each change: one
  // field at a time is one write, and the server checks the order.
  const setDates = (next: { start: string; due: string }) =>
    run(() =>
      updateTaskDetails(
        row.id,
        {
          ...(next.start !== row.start ? { start_date: next.start } : {}),
          ...(next.due !== row.due ? { due_date: next.due } : {}),
        },
        row.rowVersion
      )
    );

  return (
    <>
      <div className="trk-scrim" onClick={onClose} aria-hidden="true" />
      <aside ref={drawerRef} className="trk-dialog" role="dialog" aria-modal="true" aria-labelledby="trk-drawer-title">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {parent && (
              <p className="text-xs text-gray-500">
                {t('tracker.partOf')}{' '}
                <button type="button" onClick={() => onOpen(parent.id)} className="text-blue-600 hover:underline">
                  {parent.title}
                </button>
              </p>
            )}
            <Tag tag={row.tag} />
            <h3 id="trk-drawer-title" className="text-xl font-semibold leading-snug mt-1">
              {row.title}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{round ? round.name : t('tracker.unsorted')}</span>
              <span className={`trk-chip-health trk-h-${tone}`}>
                {tone === 'future'
                  ? t('tracker.startsOn', { date: formatDay(row.start, locale) })
                  : t(`tracker.health.${row.health}`)}
              </span>
            </p>
          </div>
          {/* Edit and delete up here with the close, where they are found
              without scrolling past everything else first. */}
          <div className="flex shrink-0 items-center gap-2">
            {row.can.edit && (
              <button
                type="button"
                onClick={onEdit}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                {t('tracker.edit')}
              </button>
            )}
            {row.can.remove && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="px-3 py-1.5 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
              >
                {t('common.delete')}
              </button>
            )}
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label={t('weekly.close')}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

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

        {/* The answers first, large: how far, how long left, how much of the
            checklist -- and the dates, which can be changed here. */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label={t('tracker.col.progress')}>{row.progress}%</Stat>
          <Stat label={t('tracker.col.left')} tone={late ? 'late' : undefined}>
            {left}
          </Stat>
          <Stat label={t('tracker.view.subtasks')}>
            {row.subtasks.length > 0 ? `${checklistDone}/${row.subtasks.length}` : '—'}
          </Stat>
          <div className="rounded-xl border border-gray-200 px-4 py-3 col-span-2 lg:col-span-1">
            <div className="text-xs text-gray-500 mb-1.5">{t('tracker.dates')}</div>
            {row.can.edit ? (
              <DateRange value={{ start: row.start, due: row.due }} onChange={setDates} disabled={pending} />
            ) : (
              <div className="text-sm font-medium text-gray-900 tabular-nums">
                {formatDay(row.start, locale)}
                {row.due && ` – ${formatDay(row.due, locale)}`}
              </div>
            )}
          </div>
        </div>

        {/* Who and how far on the left, what it is and what was reported on
            the right -- side by side on a wide screen, one after the other on
            a narrow one. */}
        <div className="trk-dialog-cols">
        <div>
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
          <h4 className="trk-sec-title">{t('tracker.col.status')}</h4>
          {row.can.work ? (
            // Three states, three buttons: the choice is visible before it is made.
            <div className="trk-seg" role="group" aria-label={t('tasks.changeStatusOf', { title: row.title })}>
              {TASK_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={row.status === s}
                  disabled={pending}
                  onClick={() => row.status !== s && run(() => updateTaskStatus(row.id, s, row.rowVersion))}
                >
                  {t(`tasks.status.${s}`)}
                </button>
              ))}
            </div>
          ) : (
            <span className="trk-pill" data-status={row.status}>
              {t(`tasks.status.${row.status}`)}
            </span>
          )}
        </section>

        <section className="trk-sec">
          <h4 className="trk-sec-title">{t('tracker.col.progress')}</h4>
          {row.can.work ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {PROGRESS_STEPS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={row.progress === p}
                    disabled={pending}
                    onClick={() => p !== row.progress && run(() => setTaskProgress(row.id, p, row.rowVersion), () => setDraft(null))}
                    className={`min-w-16 px-3 py-2 rounded-lg border text-sm font-semibold tabular-nums transition disabled:opacity-50 ${
                      row.progress === p
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {p}%
                  </button>
                ))}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-blue-600 hover:underline">{t('tracker.fineTune')}</summary>
                <div className="flex items-center gap-3 mt-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={value}
                    disabled={pending}
                    onChange={(e) => setDraft(Number(e.target.value))}
                    aria-label={t('tracker.col.progress')}
                    className="trk-range flex-1"
                  />
                  <b className="trk-mono w-12 text-right">{value}%</b>
                </div>
                {draft !== null && draft !== row.progress && (
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
              </details>
            </>
          ) : (
            <b className="trk-mono text-lg">{row.progress}%</b>
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
          <h4 className="trk-sec-title">{t('tracker.view.subtasks')}</h4>
          <Checklist row={row} today={today} />
        </section>
        </div>

        <div>
        {!parent && (subs.length > 0 || row.can.addSub) && (
          <section className="trk-sec">
            <h4 className="trk-sec-title">
              {t('tracker.subprojects')}
              {subs.length > 0 && ` ${subs.length}`}
            </h4>
            {subs.length === 0 ? (
              <p className="text-sm text-gray-500">{t('tracker.noSubs')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {subs.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(s.id)}
                      className={`w-full text-left rounded-lg border border-gray-200 px-3 py-2 hover:bg-gray-50 trk-h-${s.health}`}
                    >
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-medium text-sm">{s.title}</span>
                        <span className="trk-mono text-xs shrink-0">{s.progress}%</span>
                      </span>
                      <span className="flex flex-wrap gap-x-2 text-xs text-gray-500 mt-0.5">
                        <span>
                          {s.assigneeIds.length > 0
                            ? s.assigneeIds.map((id) => person(id).name).join(', ')
                            : t('tracker.nobody')}
                        </span>
                        {s.due && <span>· {formatDay(s.due, locale)}</span>}
                        <span>· {t(`tracker.health.${s.health}`)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {row.can.addSub && (
              <button
                type="button"
                onClick={onAddSub}
                className="mt-2 px-3 py-1.5 text-sm rounded-lg border border-gray-300 hover:bg-gray-50"
              >
                {t('tracker.addSub')}
              </button>
            )}
          </section>
        )}

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
                  <span className="trk-mono text-xs text-gray-500 pt-0.5">
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
        </div>
        </div>
      </aside>
    </>
  );
}
