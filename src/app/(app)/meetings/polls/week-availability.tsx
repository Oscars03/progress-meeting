'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { addDays, type CellMeeting } from '@/lib/availability-grid';
import {
  mergeRuns,
  slotOptions,
  type AvailabilityRun,
  type RunState,
} from '@/lib/availability-runs';
import { labWallClock } from '@/lib/lab-time';
import { weekKey } from '@/lib/week';
import { weekAvailabilityAction, type WeekAvailability } from '../../calendar-actions';
import { rescheduleMeetingAction } from '../actions';
import { createPollAction } from './actions';

/**
 * Only utilities globals.css remaps for dark mode, so each state still reads
 * as green, red or neutral on the dark surface.
 *
 * A booked meeting is the exception: solid blue rather than a tint, because it
 * is not another shade on the free-to-busy scale -- it is a different kind of
 * thing, and reading it as "very busy" is exactly the mistake to avoid. Solid
 * blue on white needs no remap, which is why the buttons elsewhere use it.
 */
/**
 * Three states, three colours, no shades between them.
 *
 * There used to be a fourth: `incomplete`, grey, for an hour nobody is busy in
 * but somebody never answered. With two of eight unconnected it covered nearly
 * every hour the lab could actually meet in, so the colour meaning "this is
 * possible" was also the colour meaning "we are not sure". Who never answered
 * is a fact about the block, and the panel below says it by name.
 */
const RUN_TONE: Record<RunState, string> = {
  free: 'bg-green-50 text-green-700 border-green-200',
  busy: 'bg-red-50 text-red-700 border-red-200',
  meeting: 'bg-blue-600 text-white border-blue-600',
};

const RUN_LABEL: Record<RunState, 'avail.runFree' | 'avail.runBusy' | 'avail.runMeeting'> = {
  free: 'avail.runFree',
  busy: 'avail.runBusy',
  meeting: 'avail.runMeeting',
};

/**
 * One half hour's worth of height, in pixels.
 *
 * Runs are sized rather than stacked, so an hour is an hour tall wherever it
 * is: a block twice as tall really is twice as long, which is the whole reason
 * the grid keeps a time axis instead of becoming a list.
 */
const CELL_PX = 22;

/**
 * How long the meeting is, offered as a few lengths rather than a free number.
 *
 * These are the lengths this lab actually books. A minutes field would accept
 * 47 and then have to explain why the grid cannot honour it -- everything here
 * is built on the half hour.
 */
const LENGTHS: { minutes: number; key: 'avail.mins30' | 'avail.hours1' | 'avail.hours1h' | 'avail.hours2' }[] = [
  { minutes: 30, key: 'avail.mins30' },
  { minutes: 60, key: 'avail.hours1' },
  { minutes: 90, key: 'avail.hours1h' },
  { minutes: 120, key: 'avail.hours2' },
];

const LEGEND: RunState[] = ['free', 'busy', 'meeting'];

/** The wall clock of a cell edge. `2026-09-14T11:30:00+07:00` -> `11:30`. */
const clock = (instant: string) => instant.slice(11, 16);

/**
 * The lab's day and wall clock for a UTC instant.
 *
 * Not `toLocaleString`: the browser would answer in whatever zone the laptop
 * is in, and a meeting at 13:00 in Thailand must read 13:00 whoever opens it.
 */
function labParts(iso: string): { date: string; time: string } {
  const at = labWallClock(new Date(iso)).toISOString();
  return { date: at.slice(0, 10), time: at.slice(11, 16) };
}

/** Every half hour of the day, the times a meeting may be moved to. */
const HALF_HOURS = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`
);

export default function WeekAvailabilityGrid({
  initial,
  leadWeeks,
  isAdmin,
}: {
  initial: WeekAvailability;
  /** ISO weeks this person holds the duty for -- the weeks they may ask about. */
  leadWeeks: string[];
  isAdmin: boolean;
}) {
  const { t, locale } = usePrefs();
  const router = useRouter();
  const [data, setData] = useState(initial);
  /**
   * The block being read, not the half hour: the grid draws stretches, so
   * what somebody points at is a stretch.
   */
  const [selected, setSelected] = useState<AvailabilityRun | null>(null);
  /** The slot inside it a poll would be opened for, and how long it runs. */
  const [askStart, setAskStart] = useState('');
  const [askLength, setAskLength] = useState(60);
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  /**
   * Whether moving the meeting mails everybody.
   *
   * Reset to off each time the form opens, so a decision made about one move
   * is not silently reused for the next one.
   */
  const [editNotify, setEditNotify] = useState(false);

  // Escape closes the dialog. A modal that can only be dismissed by aiming at
  // a small ✕ is worse on a phone than the panel it replaced.
  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const intl = locale === 'th' ? 'th-TH' : 'en-GB';

  // Dates are plain calendar days; formatting them at UTC noon keeps any zone
  // from shifting the label onto the neighbouring day.
  const dayLabel = (date: string) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(intl, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  const whenLabel = (span: { start: string; end: string }) =>
    `${dayLabel(span.start.slice(0, 10))} ${clock(span.start)}–${clock(span.end)}`;

  // The hour marks down the left. Every day is built from the same list of
  // starts, so a run's index positions it against these.
  const rows = data.days[0]?.cells ?? [];
  const hourMarks = rows.filter((cell) => cell.minute === 0);
  const gridHeight = rows.length * CELL_PX;

  // One pass per day: consecutive half hours in the same state become one
  // block. See lib/availability-runs.ts for why the headcount left the grid.
  const runsByDay = data.days.map((day) => mergeRuns(day.cells));
  const total = data.activeCount;
  const firstDay = data.days[0]?.date;
  const lastDay = data.days[data.days.length - 1]?.date;

  const loadWeek = (weekStart?: string) => {
    setError('');
    setSelected(null);
    startTransition(async () => {
      try {
        setData(await weekAvailabilityAction(weekStart));
      } catch {
        setError(t('avail.failed'));
      }
    });
  };

  // Judged per cell, not once for the page: the grid walks between weeks, and
  // the duty belongs to whichever week the chosen hour falls in.
  const canAsk = (span: { start: string }) =>
    isAdmin || leadWeeks.includes(weekKey(new Date(span.start)));

  /**
   * Open a poll for the slot pressed inside the block.
   *
   * A block is as long as the state lasts, which can be most of a day, and no
   * meeting is. So opening a free block lists the hours inside it, and asking
   * is pressing one of them.
   */
  const ask = (run: AvailabilityRun, slot: { start: string; end: string }) => {
    const day = run.start.slice(0, 10);
    const offset = run.start.slice(19);
    // An end of 00:00 belongs to the next day, which is the one case where the
    // slot does not share the block's date.
    const endDay = slot.end === '00:00' ? addDays(day, 1) : day;
    const span = {
      start: `${day}T${slot.start}:00${offset}`,
      end: `${endDay}T${slot.end}:00${offset}`,
    };

    const when = whenLabel(span);
    const message =
      run.state === 'free' ? t('avail.askConfirm', { when }) : t('avail.askNotAllFree', { when });
    if (!confirm(message)) return;

    setError('');
    setAsking(true);
    startTransition(async () => {
      try {
        const result = await createPollAction({
          title: t('avail.pollTitle', { when }),
          note: '',
          slots: [{ start: span.start, end: span.end }],
        });
        if (!result.ok) throw new Error(t(result.error as Parameters<typeof t>[0]));
        router.push(`/meetings/polls/${result.pollId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('avail.failed'));
        setAsking(false);
      }
    });
  };

  // Whether the selected hour has passed is decided when it is clicked, not on
  // every render: reading the clock during render is impure, and would differ
  // between the server's HTML and the browser's.
  const [selectedIsPast, setSelectedIsPast] = useState(false);

  const pick = (run: AvailabilityRun, alreadyOpen: boolean, isPast: boolean) => {
    setEditing(false);
    if (alreadyOpen) {
      setSelected(null);
      return;
    }

    setSelected(run);
    setSelectedIsPast(isPast);

    // The block's own beginning, which is the slot people want most often.
    setAskStart(clock(run.start));
  };

  // The hours on offer inside the block being read, and whichever of them is
  // chosen. Derived rather than stored: the list changes with the length, and
  // a stored copy would go stale the moment either changed.
  const slots = selected ? slotOptions(selected, askLength) : [];
  const chosen = slots.find((slot) => slot.start === askStart) ?? slots[0];

  /** The meeting's own span in the lab's zone, e.g. `Mon 14 Sep 13:00–15:00`. */
  const meetingSpan = (meeting: CellMeeting) => {
    const from = labParts(meeting.startAt);
    const to = labParts(meeting.endAt);
    return `${dayLabel(from.date)} ${from.time}–${to.time}`;
  };

  const startEditing = (meeting: CellMeeting) => {
    const from = labParts(meeting.startAt);
    const to = labParts(meeting.endAt);
    setError('');
    setEditDate(from.date);
    setEditStart(from.time);
    setEditEnd(to.time);
    setEditNotify(false);
    setEditing(true);
  };

  const save = (meeting: CellMeeting) => {
    setError('');
    startTransition(async () => {
      const result = await rescheduleMeetingAction(
        meeting.id,
        // Bare wall clocks. The action reads them as Thailand, which is what
        // the person typing them meant.
        { start_at: `${editDate}T${editStart}`, end_at: `${editDate}T${editEnd}` },
        meeting.rowVersion,
        editNotify
      );
      if (!result.ok) {
        setError(t(result.error as Parameters<typeof t>[0]));
        return;
      }
      setEditing(false);
      setSelected(null);
      setData(await weekAvailabilityAction(data.weekStart));
      router.refresh();
    });
  };

  return (
    <section className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      {/* No heading of its own: the page's title already names it. */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => firstDay && loadWeek(addDays(firstDay, -7))}
            disabled={isPending}
            aria-label={t('avail.prevWeek')}
            title={t('avail.prevWeek')}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => loadWeek()}
            disabled={isPending}
            className="h-8 px-3 rounded-lg border border-gray-200 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          >
            {t('avail.thisWeek')}
          </button>
          <button
            type="button"
            onClick={() => firstDay && loadWeek(addDays(firstDay, 7))}
            disabled={isPending}
            aria-label={t('avail.nextWeek')}
            title={t('avail.nextWeek')}
            className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            ›
          </button>
        </div>
      </div>

      {/* The week on screen, and whose turn it is to arrange it.

          The grid walks between weeks and the duty belongs to a week, so the
          two belong on one line: the page where the lab decides when to meet
          did not say who was doing the arranging, and the answer lived on
          another page entirely. */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-gray-900 tabular-nums">
          <span>{firstDay && lastDay ? `${dayLabel(firstDay)} – ${dayLabel(lastDay)}` : ''}</span>
          {data.leadName ? (
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              {t('avail.weekLead')}: {data.leadName}
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
              {t('avail.weekNoLead')}
            </span>
          )}
          {isPending && !asking && <span className="text-xs text-gray-500">{t('avail.loading')}</span>}
        </p>
        <ul className="flex flex-wrap items-center gap-3 text-xs">
          {LEGEND.map((state) => (
            <li key={state} className="flex items-center gap-1.5 text-gray-600">
              <span className={`inline-block h-3 w-3 rounded border ${RUN_TONE[state]}`} aria-hidden="true" />
              {t(RUN_LABEL[state])}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-gray-500">
        {data.readCount === total && total > 0
          ? t('avail.coverageAll', { total })
          : t('avail.coverage', { read: data.readCount, total })}
      </p>

      {error && (
        <div role="status" className="p-2.5 text-sm text-red-800 bg-red-50 rounded-lg border border-red-200">
          {error}
        </div>
      )}

      {/* Blocks, not cells. The old grid drew one button per half hour per
          day -- 196 of them, each carrying a headcount, and a column would
          repeat the same number eight rows running because a commitment
          lasts hours and a cell does not. A run of half hours in the same
          state is one block now, labelled once. See lib/availability-runs.ts.

          Runs are positioned rather than stacked, so an hour is the same
          height wherever it falls and the time axis on the left still means
          something. */}
      <div className="overflow-x-auto">
        <div className={`flex gap-1.5 min-w-[640px] ${isPending && !asking ? 'opacity-60' : ''}`}>
          <div className="w-12 shrink-0">
            <div className="h-9 text-xs text-gray-500">{t('avail.time')}</div>
            <div className="relative" style={{ height: gridHeight }}>
              {hourMarks.map((mark, index) => (
                <div
                  key={mark.start}
                  className="absolute left-0 right-1 text-right text-[0.7rem] tabular-nums text-gray-400"
                  style={{ top: index * CELL_PX * 2 - 6 }}
                >
                  {clock(mark.start)}
                </div>
              ))}
            </div>
          </div>

          {data.days.map((day, dayIndex) => (
            <div key={day.date} className="flex-1 min-w-20">
              <div className="h-9 text-center text-xs font-medium text-gray-600 whitespace-nowrap">
                {dayLabel(day.date)}
              </div>
              <div className="relative" style={{ height: gridHeight }}>
                {/* One faint rule an hour, behind the blocks, so a block can
                    be read against the clock without being boxed in. */}
                {hourMarks.map((mark, index) => (
                  <div
                    key={mark.start}
                    className="absolute left-0 right-0 border-t border-gray-100"
                    style={{ top: index * CELL_PX * 2 }}
                    aria-hidden="true"
                  />
                ))}

                {runsByDay[dayIndex].map((run) => {
                  const isSelected = selected?.start === run.start;
                  const state = t(RUN_LABEL[run.state]);
                  const label = run.meeting
                    ? t('avail.cellMeeting', { when: whenLabel(run), title: run.meeting.title })
                    : t('avail.runTitle', { when: whenLabel(run), state });
                  const tall = run.length > 1;

                  return (
                    <div
                      key={run.start}
                      className="absolute left-0 right-0 p-px"
                      style={{ top: run.from * CELL_PX, height: run.length * CELL_PX }}
                    >
                      <button
                        type="button"
                        onClick={() => pick(run, isSelected, Date.parse(run.end) <= Date.now())}
                        aria-pressed={isSelected}
                        aria-label={label}
                        title={label}
                        className={`flex h-full w-full flex-col items-center justify-center gap-0.5 overflow-hidden rounded-md border px-1 leading-tight transition hover:brightness-95 ${
                          RUN_TONE[run.state]
                        } ${isSelected ? 'ring-2 ring-blue-600' : ''}`}
                      >
                        {tall && (
                          <span className="text-[0.65rem] tabular-nums opacity-80">
                            {clock(run.start)}–{clock(run.end)}
                          </span>
                        )}
                        <span className="text-[0.7rem] font-semibold truncate max-w-full">
                          {run.meeting ? run.meeting.title : state}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>


      <p className="text-xs text-gray-500">{t('avail.pickHint')}</p>

      {/* A dialog, not a panel under the grid.

          It used to be written below, which on a week that fills the screen
          meant pressing a block, losing sight of it, scrolling down to read
          who was free and scrolling back. The answer to "what is this block"
          belongs over the block, where the question was asked. */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={whenLabel(selected)}
          onClick={(e) => {
            // The backdrop closes it; a press inside must not.
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <div className="max-h-[85vh] w-full space-y-3 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-lg sm:rounded-2xl sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-gray-900">{whenLabel(selected)}</p>
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${RUN_TONE[selected.state]}`}>
                {t(RUN_LABEL[selected.state])}
              </span>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label={t('avail.close')}
                className="h-7 w-7 rounded-lg text-gray-500 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>
          </div>

          {/* A booked slot answers a different question from a free one: not
              "who could make it" but "what is already here". Who was free
              before it was booked stays below, because moving it is one of the
              things you came here to do. */}
          {selected.meeting && (
            <div className="rounded-lg border border-gray-200 bg-gray-100 p-3 space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-gray-900">{selected.meeting.title}</p>
                <p className="text-xs text-gray-500 tabular-nums">
                  {meetingSpan(selected.meeting)}
                </p>
              </div>

              {canAsk(selected) ? (
                editing ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      save(selected.meeting!);
                    }}
                    className="space-y-3"
                  >
                    <div className="grid gap-2 sm:grid-cols-3">
                      <label className="text-xs text-gray-600">
                        {t('avail.editDate')}
                        <input
                          type="date"
                          required
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="mt-1 w-full min-w-0 px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900"
                        />
                      </label>
                      {(
                        [
                          ['avail.editStart', editStart, setEditStart],
                          ['avail.editEnd', editEnd, setEditEnd],
                        ] as const
                      ).map(([key, value, set]) => (
                        <label key={key} className="text-xs text-gray-600">
                          {t(key)}
                          <select
                            required
                            value={value}
                            onChange={(e) => set(e.target.value)}
                            className="mt-1 w-full min-w-0 px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white text-gray-900"
                          >
                            {HALF_HOURS.map((time) => (
                              <option key={time} value={time}>
                                {time}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    {/* Asked here rather than assumed: the same move is worth
                        an email on Monday and not worth one at eleven at
                        night, and only the person making it knows which. */}
                    <label className="flex items-start gap-2 text-xs text-gray-600">
                      <input
                        type="checkbox"
                        checked={editNotify}
                        onChange={(e) => setEditNotify(e.target.checked)}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500"
                      />
                      <span>
                        <span className="font-medium text-gray-700">{t('avail.editNotify')}</span>
                        <span className="block text-gray-500">{t('avail.editNotifyHint')}</span>
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={isPending}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                      >
                        {t('avail.editSave')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                      >
                        {t('avail.editCancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEditing(selected.meeting!)}
                    className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    {t('avail.editTime')}
                  </button>
                )
              ) : (
                <p className="text-xs text-gray-500">{t('avail.leadOnly')}</p>
              )}
            </div>
          )}

          {/* Two lists, not three. An empty calendar is a free hour now, so
              there is nobody left to file under "we do not know". */}
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            {(
              [
                ['avail.free', selected.free, 'text-green-700'],
                ['avail.busy', selected.busy, 'text-red-700'],
              ] as const
            ).map(([key, names, tone]) => (
              <div key={key}>
                <dt className={`font-medium ${tone}`}>
                  {t(key)} <span className="tabular-nums">({names.length})</span>
                </dt>
                <dd className="text-gray-700">{names.length > 0 ? names.join(', ') : t('avail.nobody')}</dd>
              </div>
            ))}
          </dl>

          {/* Nothing to ask about: this hour is already settled, and the way
              to change it is the control above, not a second poll. */}
          {selected.meeting ? null : selectedIsPast ? (
            <p className="text-xs text-gray-500">{t('avail.past')}</p>
          ) : canAsk(selected) ? (
            <div className="space-y-3">
              {/* The hours inside the block, ready to press.

                  Choosing when to meet used to be two dropdowns of 48 times
                  each, which asked the reader to work out for themselves which
                  of those 48 were inside the block they had just pressed. The
                  block already knows. */}
              <div>
                <p className="text-sm font-medium text-gray-900">{t('avail.askRange')}</p>
                <p className="text-xs text-gray-500">{t('avail.askRangeHint')}</p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500">{t('avail.askLength')}</span>
                {LENGTHS.map(({ minutes, key }) => (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => setAskLength(minutes)}
                    aria-pressed={askLength === minutes}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                      askLength === minutes
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>

              {slots.length === 0 ? (
                <p className="text-xs text-gray-500">{t('avail.askNoRoom')}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {slots.map((slot) => {
                    const isChosen = slot.start === askStart;
                    return (
                      <button
                        key={slot.start}
                        type="button"
                        onClick={() => setAskStart(slot.start)}
                        aria-pressed={isChosen}
                        className={`rounded-lg border px-3 py-1.5 text-sm tabular-nums transition ${
                          isChosen
                            ? 'border-blue-600 bg-blue-50 font-semibold text-blue-700'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {slot.start}–{slot.end}
                      </button>
                    );
                  })}
                </div>
              )}

              {chosen && (
                <button
                  type="button"
                  onClick={() => ask(selected, chosen)}
                  disabled={isPending}
                  className="w-full sm:w-auto min-h-11 px-5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-base font-semibold shadow-sm transition disabled:opacity-50"
                >
                  {asking ? t('avail.asking') : t('avail.ask')}
                </button>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-500">{t('avail.leadOnly')}</p>
          )}
          </div>
        </div>
      )}
    </section>
  );
}
