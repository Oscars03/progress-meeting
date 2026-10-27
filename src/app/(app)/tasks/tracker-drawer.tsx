'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useModal } from '@/lib/ui/modal';
import type { ActionResult } from '@/lib/action-result';
import { daysBetween, elapsedPct, formatDay } from '@/lib/tracker';
import { createTask, deleteTask, setTaskProgress, updateTaskDetails, updateTaskStatus } from './actions';
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

/** A start and an end as the lab reads them: "1 ต.ค. 69 – 20 ต.ค. 69", or as much of it as is set. */
function useSpan() {
  const { t, locale } = usePrefs();
  return (start: string, due: string) => {
    if (start && due) return `${formatDay(start, locale)} – ${formatDay(due, locale)}`;
    if (due) return `${t('tracker.checklist.until')} ${formatDay(due, locale)}`;
    if (start) return `${t('tracker.checklist.from')} ${formatDay(start, locale)}`;
    return '';
  };
}

/**
 * A project's subtasks: each a piece of work of its own -- people, dates,
 * progress, reports -- listed here as a row big enough to press. The box
 * finishes it (100%), the row opens it, and a new one is added in place with
 * its dates. Shared with the Subtasks tab.
 */
export function SubtaskList({
  parent,
  subs,
  person,
  today,
  onOpen,
}: {
  parent: TrackerRow;
  subs: TrackerRow[];
  person: (id: string) => TrackerPerson;
  today: string;
  onOpen: (id: string) => void;
}) {
  const { t } = usePrefs();
  const { pending, error, run } = useAction();
  const span = useSpan();
  const [adding, setAdding] = useState({ title: '', start: '', due: '' });

  const done = subs.filter((s) => s.status === 'done').length;
  const pct = subs.length > 0 ? Math.round((done / subs.length) * 100) : 0;

  // Finishing a subtask is the common case, and 100% sets it done as well;
  // un-ticking only reopens it, leaving its figure for its owner to correct.
  const tick = (s: TrackerRow, on: boolean) =>
    run(() => (on ? setTaskProgress(s.id, 100, s.rowVersion) : updateTaskStatus(s.id, 'in_progress', s.rowVersion)));

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const title = adding.title.trim();
    if (!title) return;
    run(
      () =>
        createTask({
          title,
          parent_id: parent.id,
          start_date: adding.start,
          due_date: adding.due,
          // The project's people, as a start; an advisor can change them on the
          // subtask, and anybody else's list is themselves whatever is sent.
          assignee_ids: parent.assigneeIds,
        }),
      () => setAdding({ title: '', start: '', due: '' })
    );
  };

  return (
    <div className="space-y-2">
      {subs.length === 0 ? (
        <p className="text-sm text-gray-500">{t('tracker.noSubs')}</p>
      ) : (
        <>
          <div className="flex items-center gap-3" aria-hidden="true">
            <div className="h-2 flex-1 rounded-full bg-gray-100 overflow-hidden">
              <div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <span className="trk-mono text-xs text-gray-600">
              {done}/{subs.length}
            </span>
          </div>
          <ul className="space-y-1.5">
            {subs.map((s) => {
              const when = span(s.startSet ? s.start : '', s.due);
              const late = s.status !== 'done' && Boolean(s.due) && s.due < today;
              const finished = s.status === 'done';
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    className="trk-check h-5 w-5 shrink-0"
                    checked={finished}
                    disabled={!s.can.work || pending}
                    onChange={(e) => tick(s, e.target.checked)}
                    aria-label={t('tracker.subtaskDone', { title: s.title })}
                  />
                  <button type="button" onClick={() => onOpen(s.id)} className="flex-1 min-w-0 text-left">
                    <span
                      className={`block text-sm font-medium ${finished ? 'line-through text-gray-500' : 'text-gray-900'}`}
                    >
                      {s.title}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                      {s.assigneeIds.length > 0 && (
                        <span className="flex items-center gap-1">
                          {s.assigneeIds.map((id) => (
                            <Avatar key={id} person={person(id)} />
                          ))}
                          <span>{s.assigneeIds.map((id) => person(id).name).join(', ')}</span>
                        </span>
                      )}
                      {when && <span className={`tabular-nums ${late ? 'text-red-600' : ''}`}>{when}</span>}
                    </span>
                  </button>
                  <span className={`trk-mono text-xs shrink-0 ${finished ? 'text-gray-500' : 'text-gray-900'}`}>
                    {s.progress}%
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {parent.can.addSub && (
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
              className="btn btn-primary"
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

/** A thin bar under a figure: how much of something is done. */
function MiniBar({ pct, tone = 'blue' }: { pct: number; tone?: 'blue' | 'red' | 'gray' }) {
  const fill = tone === 'red' ? 'bg-red-600' : tone === 'gray' ? 'bg-gray-400' : 'bg-blue-600';
  return (
    <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

/** One of the figures across the top of the panel: a label, the figure, and what it is measured against. */
function Stat({
  label,
  value,
  late,
  children,
}: {
  label: string;
  value: React.ReactNode;
  late?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-0.5 text-2xl font-semibold tabular-nums leading-tight ${late ? 'text-red-600' : 'text-gray-900'}`}>
        {value}
      </div>
      {children}
    </div>
  );
}

const TICKS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

/**
 * How far along, as a slider that snaps to tens and saves when let go.
 *
 * The figure follows the thumb while it moves, and stays on the new value
 * until the page comes back with it, so a release never flickers back to the
 * old number. Someone who cannot move the work sees the same figure as a bar.
 */
function ProgressCard({
  value,
  canWork,
  pending,
  onCommit,
  note,
}: {
  value: number;
  canWork: boolean;
  pending: boolean;
  onCommit: (pct: number, done: () => void) => void;
  note: string;
}) {
  const { t } = usePrefs();
  const [draft, setDraft] = useState<number | null>(null);
  // A release can arrive as more than one event (pointer, touch, blur); one save.
  const sent = useRef<number | null>(null);
  const keyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shown = draft ?? value;

  const commit = () => {
    if (keyTimer.current) clearTimeout(keyTimer.current);
    if (draft === null || draft === value || sent.current === draft) return;
    sent.current = draft;
    onCommit(draft, () => {
      setDraft(null);
      sent.current = null;
    });
  };

  useEffect(() => () => {
    if (keyTimer.current) clearTimeout(keyTimer.current);
  }, []);

  return (
    <div className="rounded-xl border border-gray-200 px-4 py-3 col-span-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-gray-500">{t('tracker.col.progress')}</span>
        <span className="text-2xl font-semibold tabular-nums leading-tight text-gray-900">{shown}%</span>
      </div>
      {canWork ? (
        <>
          <input
            type="range"
            min={0}
            max={100}
            step={10}
            value={shown}
            // Not `disabled` while saving: that would take keyboard focus away
            // after every step. A move made mid-save is simply not taken.
            aria-busy={pending}
            onChange={(e) => {
              if (!pending) setDraft(Number(e.target.value));
            }}
            onPointerUp={commit}
            onTouchEnd={commit}
            // Arrow keys step through tens; the save waits until they stop.
            onKeyUp={() => {
              if (keyTimer.current) clearTimeout(keyTimer.current);
              keyTimer.current = setTimeout(commit, 500);
            }}
            onBlur={commit}
            aria-label={t('tracker.col.progress')}
            className="trk-range trk-range-lg mt-1"
          />
          <div className="trk-ticks" aria-hidden="true">
            {TICKS.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </div>
        </>
      ) : (
        <MiniBar pct={shown} />
      )}
      <p className="text-xs text-gray-500 mt-2">{note}</p>
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
}) {
  const { t, locale } = usePrefs();
  const { pending, error, run } = useAction();
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
  const tone = row.status !== 'done' && !started ? 'future' : row.health;
  const owner = person(row.ownerId);
  const subsDone = subs.filter((s) => s.status === 'done').length;

  // The deadline is what this card leads with; how far off it is goes under
  // it. It used to be the other way round, and the date itself was a line of
  // small print beneath "4 days".
  let left = '';
  let late = false;
  if (row.status === 'done') left = t('tracker.health.done');
  else if (row.due) {
    const n = daysBetween(today, row.due);
    late = n < 0;
    left = late ? t('tracker.dueOver', { n: -n }) : n === 0 ? t('tracker.dueToday') : t('tracker.dueLeft', { n });
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
                className="btn btn-secondary btn-sm"
              >
                {t('tracker.edit')}
              </button>
            )}
            {row.can.remove && (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="btn btn-danger-soft btn-sm"
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
                className="btn btn-danger btn-sm"
              >
                {t('tracker.deleteNow')}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="btn btn-danger-soft btn-sm"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
        <ErrorLine text={error} />

        {/* The answers first, large: how far (and moved right here), how long
            left against how long it had, how much of the checklist -- and the
            dates, which can be changed here too. Each card carries something
            under its figure, so none is a number floating in empty space. */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* A project with subtasks moves when they do, so it has no slider
              of its own: one figure set by hand beside one worked out would
              be two answers to the same question. */}
          <ProgressCard
            key={row.id}
            value={row.progress}
            canWork={row.can.work && !row.rolledUp}
            pending={pending}
            onCommit={(pct, done) => run(() => setTaskProgress(row.id, pct, row.rowVersion), done)}
            note={[
              row.rolledUp ? t('tracker.rolledUp', { n: subs.length }) : '',
              elapsed !== null ? t('tracker.elapsed', { pct: elapsed }) : '',
              row.lastUpdate ? t('tracker.lastUpdate', { date: formatDay(row.lastUpdate, locale) }) : t('tracker.neverUpdated'),
              row.can.work || row.rolledUp ? '' : t('tracker.onlyTheirs'),
            ]
              .filter(Boolean)
              .join(' · ')}
          />
          <Stat
            label={t('tasks.due')}
            value={row.due ? formatDay(row.due, locale) : t('tracker.noDue')}
            late={late}
          >
            {row.due && (
              <>
                <p className={`text-sm font-medium mt-0.5 ${late ? 'text-red-600' : 'text-gray-600'}`}>{left}</p>
                <MiniBar pct={elapsed ?? 0} tone={late ? 'red' : 'gray'} />
              </>
            )}
          </Stat>
          <Stat
            label={t('tracker.view.subtasks')}
            value={subs.length > 0 ? `${subsDone}/${subs.length}` : '—'}
          >
            {subs.length > 0 && <MiniBar pct={(subsDone / subs.length) * 100} />}
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

        {/* Who and in what state on the left; the subtasks, what it is and what
            was reported on the right -- side by side on a wide screen, one
            after the other on a narrow one. */}
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
                  data-status={s}
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

        </div>

        <div>
        {/* A subtask's own subtasks would be a second level, which there is not. */}
        {!parent && (
          <section className="trk-sec">
            <h4 className="trk-sec-title">{t('tracker.view.subtasks')}</h4>
            <SubtaskList parent={row} subs={subs} person={person} today={today} onOpen={onOpen} />
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
              className="btn btn-secondary btn-sm mt-3"
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
