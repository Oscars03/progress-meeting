'use client';

import InfoTip from '@/lib/ui/info-tip';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useModal } from '@/lib/ui/modal';
import { TASK_TAGS, formatDay } from '@/lib/tracker';
import { createTask, updateTaskDetails } from './actions';
import type { TrackerPerson, TrackerRound, TrackerRow } from './tracker-model';
import { Avatar, CloseIcon } from './tracker-ui';

type Errors = { title?: string; people?: string; due?: string };

/**
 * Add a project, or change one.
 *
 * An advisor chooses who it is for, and has to choose somebody -- the board
 * exists to say who is doing what. A student is always adding their own, so
 * the only name on offer is theirs; they may say which advisor asked for it.
 *
 * With a `parent` it is a sub-project: the round and the label are the
 * parent's and are not asked, and a new one starts with the parent's people
 * and deadline, ready to be narrowed down.
 */
export default function ProjectForm({
  row,
  parent,
  rounds,
  nextRound,
  people,
  assignable,
  professors,
  me,
  today,
  canAssign,
  onClose,
  onSaved,
}: {
  row: TrackerRow | null;
  parent: TrackerRow | null;
  rounds: TrackerRound[];
  nextRound: TrackerRound | null;
  people: TrackerPerson[];
  assignable: string[];
  professors: string[];
  me: string;
  today: string;
  canAssign: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t, locale } = usePrefs();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});

  const [title, setTitle] = useState(row?.title ?? '');
  const [roundId, setRoundId] = useState(row ? row.roundId : parent ? '' : nextRound?.id ?? '');
  const [tag, setTag] = useState(row?.tag ?? '');
  const [start, setStart] = useState(row?.start ?? today);
  const [due, setDue] = useState(row ? row.due : parent ? parent.due : nextRound?.due ?? '');
  const [details, setDetails] = useState(row?.details ?? '');
  const [lines, setLines] = useState('');
  const [picked, setPicked] = useState<string[]>(
    row ? row.assigneeIds : !canAssign ? [me] : parent ? parent.assigneeIds : []
  );
  const [assigner, setAssigner] = useState(row?.assignerId ?? '');
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  // Escape, Tab and giving focus back, shared with every dialog. Opened from
  // the drawer, this sits on top of it, and Escape used to close both.
  const dialogRef = useRef<HTMLDivElement>(null);
  useModal(dialogRef, true, onClose);

  const byId = new Map(people.map((p) => [p.id, p] as const));
  // Anyone already on the work stays pickable, so they can be taken off it.
  const pickable = [...new Set([...assignable, ...picked])]
    .map((id) => byId.get(id))
    .filter((p): p is TrackerPerson => Boolean(p));
  const self = byId.get(me);

  const chooseRound = (id: string) => {
    setRoundId(id);
    const round = rounds.find((r) => r.id === id);
    if (round?.due) setDue(round.due);
  };

  const toggle = (id: string) => {
    setErrors((e) => ({ ...e, people: undefined }));
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Errors = {};
    if (!title.trim()) next.title = t('tasks.titleRequired');
    if (canAssign && picked.length === 0) next.people = t('tasks.assigneeRequired');
    if (!due) next.due = t('tracker.form.dueRequired');
    else if (start && due < start) next.due = t('tasks.dueBeforeStart');
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setError(null);
    const who = canAssign ? { assignee_ids: picked } : { assigner_id: assigner };
    startTransition(async () => {
      try {
        const res = row
          ? await updateTaskDetails(
              row.id,
              {
                title,
                details,
                due_date: due,
                // An inferred start is only written once somebody changes it.
                ...(row.startSet || start !== row.start ? { start_date: start } : {}),
                ...(parent ? {} : { round_id: roundId, category: tag }),
                ...who,
              },
              row.rowVersion
            )
          : await createTask({
              title,
              details,
              due_date: due,
              start_date: start,
              ...(parent ? { parent_id: parent.id } : { round_id: roundId, category: tag }),
              subtasks: lines.split('\n'),
              ...who,
            });
        if (!res.ok) {
          setError(t(res.error, res.vars));
          return;
        }
        router.refresh();
        const names = (canAssign ? picked : [me]).map((id) => byId.get(id)?.name ?? '').join(', ');
        onSaved(row ? t('tracker.saved', { title: title.trim() }) : t('tracker.added', { title: title.trim(), names }));
      } catch {
        setError(t('error.generic'));
      }
    });
  };

  const field = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white';

  return (
    // No close on a click outside: a stray click would throw away a form
    // somebody has half filled in. Cancel, the cross and Escape all close it.
    <div className="motion-scrim fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="trk-form-title"
        className="motion-dialog bg-white rounded-2xl shadow-xl w-full max-w-3xl p-5 sm:p-7 overflow-y-auto max-h-[92dvh]"
      >
        <div className="flex items-start justify-between gap-3">
          <h3 id="trk-form-title" className="text-lg font-semibold text-gray-900">
            {parent
              ? row
                ? t('tracker.form.editSub')
                : t('tracker.form.newSub')
              : row
                ? t('tracker.form.edit')
                : canAssign
                  ? t('tracker.form.new')
                  : t('tracker.form.newMine')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label={t('weekly.close')}
          >
            <CloseIcon />
          </button>
        </div>

        {parent && <p className="text-sm text-gray-600 mt-1">{t('tracker.form.subOf', { title: parent.title })}</p>}

        {error && (
          <div role="alert" className="mt-3 p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={submit} noValidate className="mt-4 grid gap-4 text-sm">
          <div>
            <label htmlFor="trk-f-title" className="block text-gray-600 mb-1">
              {parent ? t('tracker.form.subName') : t('tracker.form.name')} <span className="text-red-600">*</span>
            </label>
            <input
              ref={titleRef}
              id="trk-f-title"
              type="text"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setErrors((x) => ({ ...x, title: undefined }));
              }}
              placeholder={t('tracker.form.namePlaceholder')}
              autoComplete="off"
              aria-invalid={Boolean(errors.title)}
              className={field}
            />
            {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
          </div>

          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span id="trk-f-people" className="text-gray-600">
                {t('tasks.assignees')} <span className="text-red-600">*</span>
              </span>
              <InfoTip>{canAssign ? t('tracker.form.peopleHint') : t('tracker.form.peopleSelf')}</InfoTip>
            </div>
            <div role="group" aria-labelledby="trk-f-people" className="flex flex-wrap gap-1.5">
              {canAssign ? (
                pickable.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="trk-pick"
                    data-role={p.role}
                    aria-pressed={picked.includes(p.id)}
                    onClick={() => toggle(p.id)}
                  >
                    <Avatar person={p} />
                    {p.name}
                  </button>
                ))
              ) : (
                self && (
                  <span className="trk-pick" aria-pressed="true" data-locked="">
                    <Avatar person={self} />
                    {self.name}
                  </span>
                )
              )}
              {canAssign && pickable.length === 0 && (
                <span className="text-gray-500">{t('tracker.form.noPeople')}</span>
              )}
            </div>
            {errors.people && <p className="text-xs text-red-600 mt-1">{errors.people}</p>}
          </div>

          {!canAssign && (
            <div>
              <label htmlFor="trk-f-assigner" className="block text-gray-600 mb-1">
                {t('tasks.assigner')}
              </label>
              <select
                id="trk-f-assigner"
                value={assigner}
                onChange={(e) => setAssigner(e.target.value)}
                className={field}
              >
                <option value="">{t('tasks.assignerNone')}</option>
                {professors.map((id) => (
                  <option key={id} value={id}>
                    {byId.get(id)?.name ?? id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!parent && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="trk-f-round" className="block text-gray-600 mb-1">
                  {t('tracker.form.round')}
                </label>
                <select id="trk-f-round" value={roundId} onChange={(e) => chooseRound(e.target.value)} className={field}>
                  {rounds.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.due ? `${r.name} · ${t('tracker.due', { date: formatDay(r.due, locale) })}` : r.name}
                    </option>
                  ))}
                  <option value="">{t('tracker.unsorted')}</option>
                </select>
              </div>
              <div>
                <label htmlFor="trk-f-tag" className="block text-gray-600 mb-1">
                  {t('tracker.form.tag')}
                </label>
                <select id="trk-f-tag" value={tag} onChange={(e) => setTag(e.target.value)} className={field}>
                  <option value="">{t('tracker.form.noTag')}</option>
                  {TASK_TAGS.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="trk-f-start" className="block text-gray-600 mb-1">
                {t('tracker.form.start')}
              </label>
              <input
                id="trk-f-start"
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setErrors((x) => ({ ...x, due: undefined }));
                }}
                className={field}
              />
            </div>
            <div>
              <label htmlFor="trk-f-due" className="block text-gray-600 mb-1">
                {t('tasks.due')} <span className="text-red-600">*</span>
              </label>
              <input
                id="trk-f-due"
                type="date"
                value={due}
                onChange={(e) => {
                  setDue(e.target.value);
                  setErrors((x) => ({ ...x, due: undefined }));
                }}
                aria-invalid={Boolean(errors.due)}
                className={field}
              />
              {errors.due && <p className="text-xs text-red-600 mt-1">{errors.due}</p>}
            </div>
          </div>

          {/* A new project only: a subtask has no subtasks of its own. */}
          {!row && !parent && (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label htmlFor="trk-f-subtasks" className="text-gray-600">
                  {t('tracker.form.subtasks')}
                </label>
                <InfoTip>{t('tracker.form.subtasksHint')}</InfoTip>
              </div>
              <textarea
                id="trk-f-subtasks"
                rows={3}
                value={lines}
                onChange={(e) => setLines(e.target.value)}
                className={field}
              />
            </div>
          )}

          <div>
            <label htmlFor="trk-f-details" className="block text-gray-600 mb-1">
              {t('tasks.details')}
            </label>
            <textarea
              id="trk-f-details"
              rows={2}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className={field}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="btn btn-primary"
            >
              {pending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
