'use client';

import { Fragment, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePrefs } from '@/lib/ui/prefs';
import {
  HEALTHS,
  STALE_AFTER_DAYS,
  daysBetween,
  elapsedPct,
  formatDay,
  monthName,
  monthOffset,
  monthStart,
  timelineWindow,
  yearLabel,
  type Health,
} from '@/lib/tracker';
import type { TrackerPerson, TrackerRound, TrackerRow } from './tracker-model';
import { Avatar, Tag } from './tracker-ui';
import ProjectDrawer, { Checklist } from './tracker-drawer';
import ProjectForm from './project-form';
import RoundsDialog from './rounds-dialog';

type View = 'table' | 'timeline' | 'subtasks';
type FormState = { mode: 'new' } | { mode: 'edit'; id: string } | null;

/** Rows in no round, or in one since deleted, gather under this. */
const UNSORTED: TrackerRound = { id: '', name: '', due: '', rowVersion: 0 };

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
}) {
  const { t, locale } = usePrefs();
  const [view, setView] = useState<View>('table');
  const [health, setHealth] = useState<Health | null>(null);
  const [query, setQuery] = useState('');
  const [mine, setMine] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(null);
  const [roundsOpen, setRoundsOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p] as const)), [people]);
  const person = (id: string): TrackerPerson =>
    byId.get(id) ?? { id, name: t('common.deletedUser'), role: '', tone: 5 };
  const names = (ids: string[]) => ids.map((id) => person(id).name).join(', ');

  const showNotice = (text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 3500);
  };

  const q = query.trim().toLowerCase();
  const matches = (r: TrackerRow) => {
    if (health && r.health !== health) return false;
    if (mine && !r.assigneeIds.includes(me)) return false;
    if (!q) return true;
    return [r.title, r.tag, names(r.assigneeIds), ...r.subtasks.map((s) => s.title)]
      .join(' ')
      .toLowerCase()
      .includes(q);
  };
  const visible = rows.filter(matches);
  const filtering = Boolean(health || mine || q);
  const clearFilters = () => {
    setHealth(null);
    setMine(false);
    setQuery('');
  };

  const counts = Object.fromEntries(HEALTHS.map((h) => [h, 0])) as Record<Health, number>;
  for (const r of rows) counts[r.health]++;
  const nextRound = rounds.find((r) => r.due && r.due >= today);
  const onIt = new Set(rows.flatMap((r) => r.assigneeIds)).size;

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

  const subtaskCount = (r: TrackerRow) =>
    r.subtasks.length === 0 ? (
      <span className="trk-muted">—</span>
    ) : (
      <span className="trk-mono">
        {r.subtasks.filter((s) => s.done).length}/{r.subtasks.length}
      </span>
    );

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
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {t('tracker.clearFilters')}
          </button>
        </>
      )}
    </div>
  );

  const table = () => {
    const compact = view === 'timeline';
    const mid = compact ? 0 : 5;
    return (
      <>
        <div className="trk-wrap">
          <table className="trk-table">
            <thead>
              <tr>
                <th className="trk-proj">{compact ? t('tracker.col.projectPeople') : t('tracker.col.project')}</th>
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
                    <td colSpan={1 + mid}>
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
                        <span>· {t('tracker.count', { n: items.length })}</span>
                      </span>
                    </td>
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
                    <tr
                      key={r.id}
                      className={`trk-row trk-h-${tone(r)}`}
                      onClick={() => setOpenId(r.id)}
                    >
                      <td className="trk-proj">
                        <div className="font-medium leading-snug">
                          <button
                            type="button"
                            className="text-left hover:underline focus-visible:underline"
                            onClick={() => setOpenId(r.id)}
                          >
                            {r.title}
                          </button>
                          <Tag tag={r.tag} />
                        </div>
                        {healthLine(r)}
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
                          <td>
                            {r.assigneeIds.length > 0 ? (
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
                            )}
                          </td>
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
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <div className="trk-legend">
          <span>
            <span className="trk-lg-tick" />
            {t('tracker.legend.tick')}
          </span>
          <span>
            <span className="trk-lg-dl" />
            {t('tracker.legend.deadline')}
          </span>
          <span>{t('tracker.legend.stale', { n: STALE_AFTER_DAYS })}</span>
          <span>{t('tracker.legend.scroll')}</span>
        </div>
      </>
    );
  };

  const subtasks = () => {
    const cards = visible.filter((r) => r.subtasks.length > 0 || r.can.work);
    if (cards.length === 0) return <div className="trk-wrap">{empty}</div>;
    return (
      <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(min(100%,320px),1fr))]">
        {cards.map((r) => {
          const round = rounds.find((x) => x.id === r.roundId);
          return (
            <section key={r.id} className="trk-hero" style={{ padding: 16 }}>
              <div className="flex items-start justify-between gap-3 mb-1">
                <div className="min-w-0">
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
                <span className="text-xs">{subtaskCount(r)}</span>
              </div>
              <Checklist row={r} />
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <section className="trk-hero" aria-labelledby="trk-title">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <div className="trk-eyebrow">{t('tasks.title')}</div>
            <h2 id="trk-title" className="trk-title">
              {firstYear === lastYear
                ? t('tracker.titleOne', { year: firstYear })
                : t('tracker.title', { from: firstYear, to: lastYear })}
            </h2>
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
              <span>{t('tracker.summary', { projects: rows.length, people: onIt })}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <label className="relative flex-1 sm:flex-none">
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
                className="w-full sm:w-64 pl-8 pr-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
              />
            </label>
            <Link
              href="/tasks/weekly"
              className="text-sm px-3 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
            >
              {t('weekly.title')}
            </Link>
            {canManageRounds && (
              <button
                type="button"
                onClick={() => setRoundsOpen(true)}
                className="text-sm px-3 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
              >
                {t('tracker.rounds')}
              </button>
            )}
            {canAdd && (
              <button
                type="button"
                onClick={() => setForm({ mode: 'new' })}
                className="text-sm px-4 py-2 rounded-lg font-medium bg-blue-600 text-white hover:bg-blue-700 whitespace-nowrap"
              >
                {canAssign ? t('tracker.addProject') : t('tracker.addMine')}
              </button>
            )}
          </div>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="trk-seg" role="group" aria-label={t('tracker.views')}>
          {(['table', 'timeline', 'subtasks'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
              {t(`tracker.view.${v}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-600">
          {filtering && (
            <button type="button" onClick={clearFilters} className="hover:underline">
              {t('tracker.clearFilters')}
            </button>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="trk-check h-4 w-4"
              checked={mine}
              onChange={(e) => setMine(e.target.checked)}
            />
            {t('weekly.onlyMine')}
          </label>
        </div>
      </div>

      {view === 'subtasks' ? subtasks() : table()}

      {open && (
        <ProjectDrawer
          key={open.id}
          row={open}
          rounds={rounds}
          person={person}
          today={today}
          onClose={() => setOpenId(null)}
          onEdit={() => setForm({ mode: 'edit', id: open.id })}
          onDeleted={(title) => {
            setOpenId(null);
            showNotice(t('tracker.deleted', { title }));
          }}
        />
      )}

      {form && (form.mode === 'new' || editing) && (
        <ProjectForm
          row={editing}
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

      {roundsOpen && (
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

      {notice && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 bottom-5 z-[70] max-w-[calc(100%-2rem)] px-4 py-2.5 rounded-xl text-sm bg-gray-900 text-white shadow-lg"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
