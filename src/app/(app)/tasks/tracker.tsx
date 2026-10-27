'use client';

import PageHeader from '@/lib/ui/page-header';
import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePrefs } from '@/lib/ui/prefs';
import { Presence } from '@/lib/ui/presence';
import { useToast } from '@/lib/ui/toast';
import {
  HEALTHS,
  STALE_AFTER_DAYS,
  TRACKER_SORTS,
  daysBetween,
  elapsedPct,
  formatDay,
  monthName,
  monthOffset,
  monthStart,
  sortWork,
  timelineWindow,
  yearLabel,
  type Health,
  type TrackerSort,
} from '@/lib/tracker';
import { TASK_STATUSES, type TaskStatus } from './statuses';
import type { TrackerPerson, TrackerRound, TrackerRow } from './tracker-model';
import { Avatar, Tag } from './tracker-ui';
import ProjectDrawer, { SubtaskList } from './tracker-drawer';
import ProjectForm from './project-form';
import RoundsDialog from './rounds-dialog';

type View = 'table' | 'timeline' | 'subtasks';
/** A new project, a new sub-project of `parentId`, or an existing one being edited. */
type FormState = { mode: 'new'; parentId?: string } | { mode: 'edit'; id: string } | null;

/** Rows in no round, or in one since deleted, gather under this. */
const UNSORTED: TrackerRound = { id: '', name: '', due: '', rowVersion: 0 };
/** The round filter's value for that group: '' already means every round. */
const UNSORTED_FILTER = '-';

export default function Tracker({
  rows,
  rounds,
  people,
  assignable,
  professors,
  me,
  today,
  canAdd,
  canAssign,
  canManageRounds,
  initialOpen,
}: {
  rows: TrackerRow[];
  rounds: TrackerRound[];
  people: TrackerPerson[];
  assignable: string[];
  professors: string[];
  me: string;
  today: string;
  canAdd: boolean;
  canAssign: boolean;
  canManageRounds: boolean;
  /** A piece of work to open on arrival, from `?open=` in the address. */
  initialOpen?: string;
}) {
  const { t, locale } = usePrefs();
  const [view, setView] = useState<View>('table');
  const [health, setHealth] = useState<Health | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TrackerSort>('due');
  // '' for everyone; otherwise the one person whose work is shown.
  const [who, setWho] = useState('');
  const [status, setStatus] = useState<TaskStatus | ''>('');
  const [roundFilter, setRoundFilter] = useState('');
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);
  const [form, setForm] = useState<FormState>(null);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const showNotice = useToast();

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p] as const)), [people]);
  const person = (id: string): TrackerPerson =>
    byId.get(id) ?? { id, name: t('common.deletedUser'), role: '', tone: 5, color: '', nickname: '' };
  const names = (ids: string[]) => ids.map((id) => person(id).name).join(', ');

  // Sub-projects are drawn under their project, which can fold them away, in
  // the same order as the projects themselves.
  const kids = useMemo(() => {
    const byParent = new Map<string, TrackerRow[]>();
    for (const r of rows) if (r.parentId) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
    for (const [id, list] of byParent) byParent.set(id, sortWork(list, sort));
    return byParent;
  }, [rows, sort]);
  const subsOf = (r: TrackerRow) => kids.get(r.id) ?? [];
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const q = query.trim().toLowerCase();
  const matches = (r: TrackerRow) => {
    if (health && r.health !== health) return false;
    if (who && !r.assigneeIds.includes(who)) return false;
    if (status && r.status !== status) return false;
    if (!q) return true;
    return [r.title, r.tag, names(r.assigneeIds)]
      .join(' ')
      .toLowerCase()
      .includes(q);
  };
  const filtering = Boolean(health || who || status || q);
  // A subtask sits in its project's round, so the round is asked of projects.
  const inRound = (r: TrackerRow) => !roundFilter || (r.roundId || UNSORTED_FILTER) === roundFilter;
  /**
   * Projects, each kept while it or one of its sub-projects is let through: a
   * sub-project that matches is shown where it lives, under its project.
   */
  const visible = sortWork(
    rows.filter((r) => !r.parentId && inRound(r) && (matches(r) || subsOf(r).some(matches))),
    sort
  );
  const shownSubs = (r: TrackerRow) => (filtering ? subsOf(r).filter(matches) : subsOf(r));
  // Folded unless opened -- or unless a filter found something inside.
  const isOpen = (r: TrackerRow) => expanded.has(r.id) || (filtering && shownSubs(r).length > 0);
  const clearFilters = () => {
    setHealth(null);
    setWho('');
    setStatus('');
    setRoundFilter('');
    setQuery('');
  };
  // The people anything is assigned to, so no choice in the list leads to an
  // empty board. Yourself first, as "mine", then everybody else by name.
  const assignees = [...new Set(rows.flatMap((r) => r.assigneeIds))]
    .filter((id) => id !== me)
    .map(person)
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));

  const counts = Object.fromEntries(HEALTHS.map((h) => [h, 0])) as Record<Health, number>;
  for (const r of rows) counts[r.health]++;
  const nextRound = rounds.find((r) => r.due && r.due >= today);
  const onIt = new Set(rows.flatMap((r) => r.assigneeIds)).size;
  // The tiles and the rounds count every piece of work, a subtask as one like
  // any other. The summary names the two kinds apart -- "6 projects" read as
  // six projects when three were subtasks -- and the two still add up to
  // what the tiles count.
  const projectCount = rows.filter((r) => !r.parentId).length;
  const subtaskTotal = rows.length - projectCount;

  // The window the timeline covers, and how wide one month is drawn.
  const win = timelineWindow(today, [...rows.map((r) => r.due), ...rounds.map((r) => r.due)]);
  const mw = view === 'timeline' ? 88 : 62;
  const W = win.months * mw;
  const lastMonth = monthStart(win.start, win.months - 1);
  const x = (day: string, endOfDay = false) =>
    Math.min(W, Math.max(0, monthOffset(win.start, day, endOfDay) * mw));
  const firstYear = yearLabel(Number(win.start.slice(0, 4)), locale);
  const lastYear = yearLabel(Number(lastMonth.slice(0, 4)), locale);

  const future = (r: TrackerRow) => r.status !== 'done' && daysBetween(today, r.start) > 0;
  const tone = (r: TrackerRow) => (future(r) ? 'future' : r.health);
  const groups = [...rounds, UNSORTED]
    .map((round) => ({ round, items: visible.filter((r) => r.roundId === round.id) }))
    .filter((g) => g.items.length > 0);

  const open = rows.find((r) => r.id === openId) ?? null;
  const editing = form?.mode === 'edit' ? rows.find((r) => r.id === form.id) ?? null : null;
  // The project a sub-project being added, or edited, belongs under.
  const formParentId = form?.mode === 'new' ? form.parentId : editing?.parentId;
  const formParent = (formParentId && rows.find((r) => r.id === formParentId)) || null;

  const healthLine = (r: TrackerRow) => (
    <div className={`trk-health trk-h-${tone(r)}`}>
      {future(r) ? t('tracker.startsOn', { date: formatDay(r.start, locale) }) : t(`tracker.health.${r.health}`)}
    </div>
  );

  const nobody = <span className="trk-nobody">{t('tracker.nobody')}</span>;

  const guides = () => (
    <>
      {rounds
        .filter((r) => r.due)
        .map((r) => (
          <span key={r.id} className="trk-dl" style={{ left: Math.min(W - 2, x(r.due, true)) }} />
        ))}
      <span className="trk-now" style={{ left: x(today) }} />
    </>
  );

  // A folded project's dated subtasks, as thin bars under its own: the shape
  // of the work without opening it. Opened, each has a row and a bar of its
  // own instead. Only the first few: a row is one project's height.
  const subBars = (r: TrackerRow) =>
    r.parentId || isOpen(r)
      ? null
      : subsOf(r)
          .filter((s) => s.startSet && s.due)
          .slice(0, 3)
          .map((s, i) => {
            const x1 = x(s.start);
            return (
              <span
                key={s.id}
                className="trk-subbar"
                data-done={s.status === 'done' ? '' : undefined}
                title={s.title}
                style={{ left: x1, width: Math.max(4, x(s.due, true) - x1), top: `calc(50% + ${14 + i * 5}px)` }}
              />
            );
          });

  const bar = (r: TrackerRow, withNames: boolean) => {
    const cls = `trk-h-${tone(r)}`;
    if (!r.due) {
      const at = x(r.start);
      return (
        <>
          <span className={`trk-pin ${cls}`} style={{ left: at }} />
          <span className="trk-who trk-mono" style={{ left: at + 10 }}>
            {r.progress}% · {t('tracker.noDue')}
          </span>
        </>
      );
    }
    const raw = monthOffset(win.start, r.start) * mw;
    const x1 = Math.min(W, Math.max(0, raw));
    const w = Math.max(6, x(r.due, true) - x1);
    const narrow = w < 64;
    const after = x1 + w + (narrow ? 44 : 0);
    return (
      <>
        <span
          className={`trk-bar ${cls}`}
          data-clip={raw < 0 ? '' : undefined}
          data-narrow={narrow ? '' : undefined}
          style={{ left: x1, width: w }}
        >
          <i style={{ width: `${r.progress}%` }} />
          <span className="trk-mono">{r.progress}%</span>
        </span>
        {withNames && r.assigneeIds.length > 0 && after + 120 < W && (
          <span className="trk-who" style={{ left: after + 8 }}>
            {names(r.assigneeIds)}
          </span>
        )}
      </>
    );
  };

  const leftCell = (r: TrackerRow) => {
    if (r.status === 'done') return <span className="trk-muted">{t('tracker.health.done')}</span>;
    if (!r.due) return <span className="trk-muted">—</span>;
    const n = daysBetween(today, r.due);
    if (n < 0) return <span className="trk-late">{t('tracker.overdueBy', { n: -n })}</span>;
    return <span className="trk-mono">{t('tracker.daysLeft', { n })}</span>;
  };

  const progressCell = (r: TrackerRow) => {
    const elapsed = r.status === 'done' || future(r) ? null : elapsedPct(r.start, r.due, today);
    return (
      <div className={`flex items-center gap-2.5 trk-h-${tone(r)}`}>
        <span className="trk-pbar">
          <i style={{ width: `${r.progress}%` }} />
          {elapsed !== null && <span className="trk-tick" style={{ left: `${elapsed}%` }} />}
        </span>
        <span className="trk-mono text-xs w-9 text-right">{r.progress}%</span>
      </div>
    );
  };

  const subtaskCount = (r: TrackerRow) => {
    const subs = subsOf(r);
    return subs.length === 0 ? (
      <span className="trk-muted">—</span>
    ) : (
      <span className="trk-mono">
        {subs.filter((s) => s.status === 'done').length}/{subs.length}
      </span>
    );
  };

  const empty = (
    <div className="px-4 py-8 text-center text-sm text-gray-600">
      {rows.length === 0 ? (
        <p>{t('tracker.emptyAll')}</p>
      ) : (
        <>
          <p className="mb-3">{t('tracker.emptyFiltered')}</p>
          <button
            type="button"
            onClick={clearFilters}
            className="btn btn-secondary btn-sm"
          >
            {t('tracker.clearFilters')}
          </button>
        </>
      )}
    </div>
  );

  const groupLabel = (round: TrackerRound, items: TrackerRow[]) => (
    <span className="trk-group-label">
      <b>{round.id ? round.name : t('tracker.unsorted')}</b>
      <span>
        {round.due
          ? t('tracker.due', { date: formatDay(round.due, locale, true) })
          : round.id
            ? t('tracker.ownDates')
            : t('tracker.unsortedNote')}
      </span>
      {round.id && round.id === nextRound?.id && <span className="trk-next">{t('tracker.nextRound')}</span>}
      <span>· {t('tracker.count', { n: items.reduce((n, r) => n + 1 + shownSubs(r).length, 0) })}</span>
    </span>
  );

  const assigneeList = (r: TrackerRow) =>
    r.assigneeIds.length > 0 ? (
      <div className="flex flex-col gap-1">
        {r.assigneeIds.map((id) => (
          <span key={id} className="flex items-center gap-1.5">
            <Avatar person={person(id)} />
            {person(id).name}
          </span>
        ))}
      </div>
    ) : (
      nobody
    );

  const subsToggle = (r: TrackerRow) => {
    const subs = r.parentId ? [] : subsOf(r);
    if (subs.length === 0) return null;
    const open = isOpen(r);
    return (
      <button
        type="button"
        className="trk-subs-toggle tap-exempt"
        aria-expanded={open}
        aria-label={t('tracker.toggleSubs', { title: r.title })}
        onClick={(e) => {
          // The row opens the project; this only folds it.
          e.stopPropagation();
          toggle(r.id);
        }}
      >
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
        {t('tracker.subCount', { n: subs.length })}
      </button>
    );
  };

  const titleLine = (r: TrackerRow) => (
    <div className="font-medium leading-snug">
      {r.parentId && <span className="trk-sub-mark" aria-hidden="true">↳</span>}
      <button
        type="button"
        className="tap-exempt text-left hover:underline focus-visible:underline"
        onClick={() => setOpenId(r.id)}
      >
        {r.title}
      </button>
      <Tag tag={r.tag} />
    </div>
  );

  /**
   * The table view on a phone. Its columns cannot fit in 390px, so status,
   * progress and time left sat off to the right where nobody scrolled to; each
   * piece of work becomes a card that carries them all instead.
   */
  const cards = () => (
    <>
      {groups.length === 0 ? (
        <div className="trk-wrap">{empty}</div>
      ) : (
        <div className="trk-cards">
          {groups.map(({ round, items }) => (
            <section key={round.id || 'unsorted'}>
              <div className="trk-cards-head">{groupLabel(round, items)}</div>
              <ul className="trk-cards-list">
                {items.flatMap((r) => [r, ...(isOpen(r) ? shownSubs(r) : [])]).map((r) => (
                  <li
                    key={r.id}
                    className={`trk-card trk-h-${tone(r)}`}
                    data-sub={r.parentId ? '' : undefined}
                    onClick={() => setOpenId(r.id)}
                  >
                    <div className="trk-card-top">
                      <div className="min-w-0">
                        {titleLine(r)}
                        {healthLine(r)}
                      </div>
                      <span className="trk-pill" data-status={r.status}>
                        {t(`tasks.status.${r.status}`)}
                      </span>
                    </div>
                    <div className="trk-card-progress">
                      {progressCell(r)}
                      {leftCell(r)}
                    </div>
                    <div className="trk-card-foot">
                      {assigneeList(r)}
                      {subsToggle(r)}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {legend('cards')}
    </>
  );

  const table = () => {
    const compact = view === 'timeline';
    const mid = compact ? 0 : 5;
    return (
      <>
        <div className="trk-wrap">
          <table className="trk-table" data-compact={compact ? '' : undefined}>
            <thead>
              <tr>
                <th className="trk-proj">
                  {compact ? (
                    // Two unbreakable halves: in the narrow phone column a
                    // single string broke as "ผู้รับผิด / ชอบ".
                    <>
                      <span className="whitespace-nowrap">{t('tracker.col.project')}</span> ·{' '}
                      <span className="whitespace-nowrap">{t('tasks.assignees')}</span>
                    </>
                  ) : (
                    t('tracker.col.project')
                  )}
                </th>
                {!compact && (
                  <>
                    <th>{t('tasks.assignees')}</th>
                    <th>{t('tracker.col.status')}</th>
                    <th>{t('tracker.view.subtasks')}</th>
                    <th>{t('tracker.col.progress')}</th>
                    <th className="trk-num">{t('tracker.col.left')}</th>
                  </>
                )}
                <th className="trk-tlc" style={{ minWidth: W }}>
                  <div className="trk-head-tl" style={{ width: W }}>
                    {Array.from({ length: win.months }, (_, i) => {
                      const m = monthStart(win.start, i);
                      const month = Number(m.slice(5, 7)) - 1;
                      return (
                        <span key={m}>
                          {(i === 0 || month === 0) && (
                            <span className="trk-yr" style={{ left: i * mw }}>
                              {yearLabel(Number(m.slice(0, 4)), locale)}
                            </span>
                          )}
                          <span className="trk-mo" style={{ left: i * mw }}>
                            {monthName(month, locale)}
                          </span>
                        </span>
                      );
                    })}
                    <span className="trk-nowtag" style={{ left: x(today) }}>
                      {t('tracker.today')}
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.length === 0 && (
                <tr>
                  <td colSpan={2 + mid}>{empty}</td>
                </tr>
              )}
              {groups.map(({ round, items }) => (
                <Fragment key={round.id || 'unsorted'}>
                  <tr className="trk-group">
                    <td colSpan={1 + mid}>{groupLabel(round, items)}</td>
                    <td className="trk-tlc">
                      <div className="trk-tl" style={{ width: W, '--mw': `${mw}px` } as React.CSSProperties}>
                        {guides()}
                        {round.due && (
                          <span className="trk-dltag" style={{ left: Math.min(W - 2, x(round.due, true)) }}>
                            {t('tracker.deadlineOf', { name: round.name })}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                  {items.map((r) => (
                    <Fragment key={r.id}>
                      {projectRow(r)}
                      {isOpen(r) && shownSubs(r).map((s) => projectRow(s))}
                    </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {legend(compact ? 'timeline' : 'table')}
      </>
    );
  };

  /** One row of the table: a project, or -- indented under it -- a sub-project. */
  const projectRow = (r: TrackerRow) => {
    const compact = view === 'timeline';
    return (
      <tr
        key={r.id}
        className={`trk-row trk-h-${tone(r)}`}
        data-sub={r.parentId ? '' : undefined}
        onClick={() => setOpenId(r.id)}
      >
        <td className="trk-proj">
          {titleLine(r)}
          {healthLine(r)}
          {subsToggle(r)}
          {compact && (
            <div className="mt-1 text-xs">
              {r.assigneeIds.length > 0 ? (
                <span className="flex items-center gap-1.5">
                  {r.assigneeIds.map((id) => (
                    <Avatar key={id} person={person(id)} />
                  ))}
                  <span>{names(r.assigneeIds)}</span>
                </span>
              ) : (
                nobody
              )}
            </div>
          )}
        </td>
        {!compact && (
          <>
            <td>{assigneeList(r)}</td>
            <td>
              <span className="trk-pill" data-status={r.status}>
                {t(`tasks.status.${r.status}`)}
              </span>
            </td>
            <td>{subtaskCount(r)}</td>
            <td>{progressCell(r)}</td>
            <td className="trk-num">{leftCell(r)}</td>
          </>
        )}
        <td className="trk-tlc">
          <div className="trk-tl" style={{ width: W, '--mw': `${mw}px` } as React.CSSProperties}>
            {guides()}
            {bar(r, compact)}
            {subBars(r)}
          </div>
        </td>
      </tr>
    );
  };

  /**
   * One dropdown of the filter bar, its name above it. A filter that is set
   * is marked, so a board showing less than everything says why at a glance;
   * the order is never "set", only chosen.
   */
  const filterSelect = (
    label: string,
    value: string,
    onChange: (value: string) => void,
    options: { value: string; label: string }[],
    marks = true
  ) => (
    <label className="trk-filter">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} data-set={marks && value ? '' : undefined}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  /** Only what the view on screen actually draws: the cards have no deadline lines, the timeline no ticks. */
  const legend = (kind: 'table' | 'timeline' | 'cards') => (
    <div className="trk-legend">
      {kind !== 'timeline' && (
        <span>
          <span className="trk-lg-tick" />
          {t('tracker.legend.tick')}
        </span>
      )}
      {kind !== 'cards' && (
        <span>
          <span className="trk-lg-dl" />
          {t('tracker.legend.deadline')}
        </span>
      )}
      <span>{t('tracker.legend.stale', { n: STALE_AFTER_DAYS })}</span>
      {kind === 'table' && <span>{t('tracker.legend.scroll')}</span>}
      <span>{t('tracker.legend.open')}</span>
    </div>
  );

  const subtasks = () => {
    // A card per project, holding its subtasks: what is left inside each piece
    // of work, ticked off and added to without opening the project.
    const cards = visible.filter((r) => subsOf(r).length > 0 || r.can.addSub);
    if (cards.length === 0) return <div className="trk-wrap">{empty}</div>;
    return (
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,360px),1fr))]">
        {cards.map((r) => {
          const round = rounds.find((x) => x.id === r.roundId);
          return (
            <section key={r.id} className="trk-hero" style={{ padding: 16 }}>
              <div className="mb-2 min-w-0">
                <button
                  type="button"
                  className="font-medium text-left hover:underline"
                  onClick={() => setOpenId(r.id)}
                >
                  {r.title}
                </button>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600">
                  <span>{round ? round.name : t('tracker.unsorted')}</span>
                  {r.assigneeIds.length > 0
                    ? r.assigneeIds.map((id) => (
                        <span key={id} className="flex items-center gap-1.5">
                          <Avatar person={person(id)} />
                          {person(id).name}
                        </span>
                      ))
                    : nobody}
                </div>
              </div>
              <SubtaskList parent={r} subs={shownSubs(r)} person={person} today={today} onOpen={setOpenId} />
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* The page's name is the one in the menu, in the place every other
          page has it. It used to be "Project Tracker 2569-2570" in a card,
          which made Tasks the one page whose title was somewhere else. */}
      <PageHeader
        title={t('tasks.title')}
        aside={
          <span className="text-sm text-gray-500">
            {firstYear === lastYear
              ? t('tracker.titleOne', { year: firstYear })
              : t('tracker.title', { from: firstYear, to: lastYear })}
          </span>
        }
        actions={
          <>
            <Link href="/tasks/weekly" className="btn btn-secondary">
              {t('weekly.title')}
            </Link>
            {canManageRounds && (
              <button type="button" onClick={() => setRoundsOpen(true)} className="btn btn-secondary">
                {t('tracker.rounds')}
              </button>
            )}
            {canAdd && (
              <button type="button" onClick={() => setForm({ mode: 'new' })} className="btn btn-primary">
                {canAssign ? t('tracker.addProject') : t('tracker.addMine')}
              </button>
            )}
          </>
        }
      />

      <section className="trk-hero" aria-label={t('tasks.title')}>
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="trk-nextline">
              {nextRound && (
                <>
                  <span className="trk-next">{t('tracker.nextRound')}</span>
                  <span>
                    <b>{nextRound.name}</b> {t('tracker.due', { date: formatDay(nextRound.due, locale, true) })} ·{' '}
                    <b className="trk-mono">{t('tracker.inDays', { n: daysBetween(today, nextRound.due) })}</b>
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>
                {subtaskTotal > 0
                  ? t('tracker.summarySubs', { projects: projectCount, subs: subtaskTotal, people: onIt })
                  : t('tracker.summary', { projects: projectCount, people: onIt })}
              </span>
            </p>
          </div>
          {/* A row of its own on a phone: sharing one with anything else left
              it so narrow that the placeholder read "Search pr". */}
          <label className="relative w-full sm:w-auto">
            <span className="sr-only">{t('tracker.search')}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tracker.search')}
              className="w-full sm:w-80 pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
            />
          </label>
        </div>

        <div className="trk-dist" aria-hidden="true">
          {HEALTHS.filter((h) => counts[h] > 0).map((h) => (
            <i key={h} className={`trk-h-${h}`} style={{ flex: counts[h] }} />
          ))}
        </div>
        <div className="trk-tiles">
          {HEALTHS.map((h) => (
            <button
              key={h}
              type="button"
              className={`trk-tile trk-h-${h}`}
              data-zero={counts[h] === 0 ? '' : undefined}
              aria-pressed={health === h}
              onClick={() => setHealth(health === h ? null : h)}
            >
              <span className="trk-tile-label">
                <span className="trk-dot" />
                {t(`tracker.health.${h}`)}
              </span>
              <span className="trk-tile-n trk-mono">
                {counts[h]}
                <small>{t('tracker.unit')}</small>
              </span>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="trk-seg" role="group" aria-label={t('tracker.views')}>
          {(['table', 'timeline', 'subtasks'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {t(`tracker.view.${v}`)}
            </button>
          ))}
        </div>
        <div className="trk-filters">
          {filterSelect(t('tracker.sortBy'), sort, (v) => setSort(v as TrackerSort), [
            ...TRACKER_SORTS.map((v) => ({ value: v, label: t(`tracker.sort.${v}`) })),
          ], false)}
          {filterSelect(t('tasks.assignees'), who, setWho, [
            { value: '', label: t('tracker.filter.everyone') },
            { value: me, label: t('tracker.filter.mine') },
            ...assignees.map((p) => ({ value: p.id, label: p.name })),
          ])}
          {filterSelect(t('tracker.col.status'), status, (v) => setStatus(v as TaskStatus | ''), [
            { value: '', label: t('tracker.filter.anyStatus') },
            ...TASK_STATUSES.map((v) => ({ value: v, label: t(`tasks.status.${v}`) })),
          ])}
          {filterSelect(t('tracker.rounds'), roundFilter, setRoundFilter, [
            { value: '', label: t('tracker.filter.anyRound') },
            ...rounds.map((r) => ({ value: r.id, label: r.name })),
            { value: UNSORTED_FILTER, label: t('tracker.unsorted') },
          ])}
          {(filtering || roundFilter) && (
            <button type="button" onClick={clearFilters} className="trk-filters-clear">
              {t('tracker.clearFilters')}
            </button>
          )}
        </div>
      </div>

      {view === 'subtasks' ? (
        subtasks()
      ) : view === 'timeline' ? (
        table()
      ) : (
        // Both are rendered and CSS picks one, so the server's HTML is already
        // the right one for the screen it lands on.
        <>
          <div className="sm:hidden">{cards()}</div>
          <div className="hidden sm:block">{table()}</div>
        </>
      )}

      <Presence value={open}>
        {(open) => (
          <ProjectDrawer
            key={open.id}
            row={open}
            parent={rows.find((r) => r.id === open.parentId) ?? null}
            subs={subsOf(open)}
            rounds={rounds}
            person={person}
            today={today}
            onClose={() => setOpenId(null)}
            onEdit={() => setForm({ mode: 'edit', id: open.id })}
            onOpen={setOpenId}
            onDeleted={(title) => {
              setOpenId(null);
              showNotice(t('tracker.deleted', { title }));
            }}
          />
        )}
      </Presence>

      <Presence value={form && (form.mode === 'new' || editing) ? { editing, parent: formParent } : null}>
        {({ editing, parent }) => (
          <ProjectForm
            row={editing}
            parent={parent}
            rounds={rounds}
            nextRound={nextRound ?? null}
            people={people}
            assignable={assignable}
            professors={professors}
            me={me}
            today={today}
            canAssign={canAssign}
            onClose={() => setForm(null)}
            onSaved={(text) => {
              setForm(null);
              showNotice(text);
            }}
          />
        )}
      </Presence>

      <Presence value={roundsOpen}>
        {() => (
          <RoundsDialog
            rounds={rounds}
            countIn={(id) => rows.filter((r) => r.roundId === id).length}
            onClose={() => setRoundsOpen(false)}
            onSaved={(text) => {
              setRoundsOpen(false);
              showNotice(text);
            }}
          />
        )}
      </Presence>

    </div>
  );
}
