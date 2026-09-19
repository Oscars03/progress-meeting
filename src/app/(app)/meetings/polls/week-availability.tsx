'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import {
  addDays,
  type AvailabilityCell,
  type CellMeeting,
  type CellStatus,
} from '@/lib/availability-grid';
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
const TONE: Record<CellStatus, string> = {
  'all-free': 'bg-green-50 text-green-700 border-green-200',
  'some-busy': 'bg-red-50 text-red-700 border-red-200',
  incomplete: 'bg-gray-100 text-gray-500 border-gray-200',
  meeting: 'bg-blue-600 text-white border-blue-600',
};

const LEGEND: {
  status: CellStatus;
  key: 'avail.legendAllFree' | 'avail.legendSomeBusy' | 'avail.legendIncomplete' | 'avail.legendMeeting';
}[] = [
  { status: 'all-free', key: 'avail.legendAllFree' },
  { status: 'some-busy', key: 'avail.legendSomeBusy' },
  { status: 'incomplete', key: 'avail.legendIncomplete' },
  { status: 'meeting', key: 'avail.legendMeeting' },
];

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
  const [selected, setSelected] = useState<AvailabilityCell | null>(null);
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

  const whenLabel = (cell: AvailabilityCell) =>
    `${dayLabel(cell.start.slice(0, 10))} ${clock(cell.start)}–${clock(cell.end)}`;

  // One row per slot. The first day's cells define the rows; every day is
  // built from the same list of starts, so they line up by index.
  const rows = data.days[0]?.cells ?? [];
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
  const canAsk = (cell: AvailabilityCell) =>
    isAdmin || leadWeeks.includes(weekKey(new Date(cell.start)));

  const ask = (cell: AvailabilityCell) => {
    const when = whenLabel(cell);
    const message =
      cell.status === 'all-free' ? t('avail.askConfirm', { when }) : t('avail.askNotAllFree', { when });
    if (!confirm(message)) return;

    setError('');
    setAsking(true);
    startTransition(async () => {
      try {
        const result = await createPollAction({
          title: t('avail.pollTitle', { when }),
          note: '',
          slots: [{ start: cell.start, end: cell.end }],
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('avail.title')}</h3>
          <p className="text-sm text-gray-500">{t('avail.subtitle')}</p>
        </div>

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

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="font-medium text-gray-900 tabular-nums">
          {firstDay && lastDay ? `${dayLabel(firstDay)} – ${dayLabel(lastDay)}` : ''}
          {isPending && !asking && <span className="ml-2 text-xs text-gray-500">{t('avail.loading')}</span>}
        </p>
        <ul className="flex flex-wrap items-center gap-3 text-xs">
          {LEGEND.map(({ status, key }) => (
            <li key={status} className="flex items-center gap-1.5 text-gray-600">
              <span className={`inline-block h-3 w-3 rounded border ${TONE[status]}`} aria-hidden="true" />
              {t(key)}
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

      <div className="overflow-x-auto">
        <table className={`w-full border-separate border-spacing-1 text-xs ${isPending && !asking ? 'opacity-60' : ''}`}>
          <thead>
            <tr>
              <th scope="col" className="w-12 text-left font-normal text-gray-500">
                {t('avail.time')}
              </th>
              {data.days.map((day) => (
                <th key={day.date} scope="col" className="px-1 py-1 font-medium text-gray-600 whitespace-nowrap">
                  {dayLabel(day.date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((rowCell, row) => (
              <tr key={rowCell.start}>
                {/* The half hours are set back rather than left blank: you
                    have to be able to aim at 11:30, but the hour is still what
                    you read the column by. Twice the rows is twice the height,
                    so the half hour is drawn shorter and lighter -- the week
                    still fits a screen, and the eye lands on the hours. */}
                <th
                  scope="row"
                  className={`pr-1 text-left font-normal tabular-nums whitespace-nowrap ${
                    rowCell.minute === 0
                      ? 'text-gray-500'
                      : 'text-gray-400 text-[0.6rem] leading-none'
                  }`}
                >
                  {clock(rowCell.start)}
                </th>
                {data.days.map((day) => {
                  const cell = day.cells[row];
                  const isSelected = selected?.start === cell.start;
                  const label = cell.meeting
                    ? t('avail.cellMeeting', { when: whenLabel(cell), title: cell.meeting.title })
                    : t('avail.cellTitle', {
                        when: whenLabel(cell),
                        free: cell.free.length,
                        busy: cell.busy.length,
                        unknown: cell.unknown.length,
                      });
                  return (
                    <td key={cell.start} className="p-0">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(isSelected ? null : cell);
                          setSelectedIsPast(!isSelected && Date.parse(cell.end) <= Date.now());
                          setEditing(false);
                        }}
                        aria-pressed={isSelected}
                        aria-label={label}
                        title={label}
                        className={`w-full min-w-14 rounded-md border px-1 font-semibold tabular-nums leading-tight transition hover:brightness-95 ${TONE[cell.status]} ${
                          cell.minute === 0 ? 'py-1' : 'py-0 text-[0.7rem]'
                        } ${isSelected ? 'ring-2 ring-blue-600' : ''}`}
                      >
                        {cell.meeting ? '●' : `${cell.free.length}/${total}`}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="space-y-3 rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-gray-900">{whenLabel(selected)}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TONE[selected.status]}`}>
              {t(LEGEND.find((l) => l.status === selected.status)!.key)}
            </span>
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

          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            {(
              [
                ['avail.free', selected.free, 'text-green-700'],
                ['avail.busy', selected.busy, 'text-red-700'],
                ['avail.unknown', selected.unknown, 'text-gray-500'],
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
            <button
              type="button"
              onClick={() => ask(selected)}
              disabled={isPending}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {asking ? t('avail.asking') : t('avail.ask')}
            </button>
          ) : (
            <p className="text-xs text-gray-500">{t('avail.leadOnly')}</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-500">{t('avail.pickHint')}</p>
      )}
    </section>
  );
}
