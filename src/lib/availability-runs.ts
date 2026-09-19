/**
 * Consecutive half hours in the same state, merged into one run.
 *
 * The grid used to draw one cell per half hour per day: 28 rows across 7
 * columns, 196 cells, each carrying a headcount like `5/8`. Almost all of it
 * was repetition -- a column would say `5/8` eight rows in a row, because a
 * commitment lasts hours and the cells did not. One Thursday read
 * `5/8, 3/8, 4/8, 3/8, 4/8, 5/8, 4/8` down the afternoon: seven different
 * numbers making the same single point, that somebody cannot make it.
 *
 * So the headcount is gone from the grid and three states are left -- free,
 * busy, already booked. That is what makes the merge worth anything: runs only
 * break where the *state* changes, not where the count does, and the same week
 * comes to about twenty blocks instead of a hundred and ninety-six.
 *
 * The numbers are not lost. Selecting a run still lists who is free, who is
 * busy and who never answered, which is where a name belongs -- a cell was
 * never able to show one.
 */

import type { AvailabilityCell, CellMeeting } from './availability-grid';

export type RunState = 'free' | 'busy' | 'meeting';

export type AvailabilityRun = {
  state: RunState;
  /** ISO instant of the first cell's start, with the lab offset. */
  start: string;
  /** ISO instant of the last cell's end. */
  end: string;
  /** Index of the first cell in the day, so a run can be positioned. */
  from: number;
  /** How many cells it covers, so a run can be sized. */
  length: number;
  /** The booked meeting, on a run in the `meeting` state. */
  meeting: CellMeeting | null;
  /** Free in *every* cell of the run -- see `runPeople`. */
  free: string[];
  busy: string[];
};

/** Busy is busy; everything else is free. */
export function runState(cell: AvailabilityCell): RunState {
  if (cell.status === 'meeting') return 'meeting';
  return cell.status === 'some-busy' ? 'busy' : 'free';
}

/**
 * Who is free for the *whole* run, and who is not.
 *
 * Free means free in every cell of it: a run is offered as one stretch, and
 * somebody free for half of it cannot take the meeting. Busy is the opposite
 * -- busy anywhere in the run is busy for it.
 */
function runPeople(cells: AvailabilityCell[]): Pick<AvailabilityRun, 'free' | 'busy'> {
  const busy = new Set<string>();
  // Null until the first cell, which seeds it: an empty set would intersect
  // to nothing and report that nobody is ever free.
  let free: Set<string> | null = null;
  const narrow = (a: Set<string>, b: Set<string>) => new Set([...a].filter((name) => b.has(name)));

  for (const cell of cells) {
    for (const name of cell.busy) busy.add(name);
    const here = new Set(cell.free);
    free = free === null ? here : narrow(free, here);
  }

  return {
    free: [...(free ?? new Set<string>())].filter((name) => !busy.has(name)),
    busy: [...busy],
  };
}

/** `2026-09-14T11:30:00+07:00` -> `11:30`. */
const clock = (instant: string) => instant.slice(11, 16);

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

// 1440 is midnight at the far end of the day, written the way a clock writes
// it rather than as 24:00, which no time field accepts.
const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Every meeting of `minutes` that fits inside a run, half an hour apart.
 *
 * A block is as long as the state lasts, which can be most of a day, and no
 * meeting is. Two dropdowns could express the span but made the reader do the
 * arithmetic; these are the answers, ready to press. The step is the half hour
 * the grid is built on, so a slot always lines up with the cells underneath.
 */
export function slotOptions(
  run: Pick<AvailabilityRun, 'start' | 'end'>,
  minutes: number
): { start: string; end: string }[] {
  const from = minutesOf(clock(run.start));
  // Midnight closes the day rather than starting it again.
  const until = clock(run.end) === '00:00' ? 24 * 60 : minutesOf(clock(run.end));

  const out: { start: string; end: string }[] = [];
  for (let at = from; at + minutes <= until; at += 30) {
    out.push({ start: hhmm(at), end: hhmm(at + minutes) });
  }
  return out;
}

/**
 * Split one day's cells into runs.
 *
 * Two meetings back to back stay two runs even though both are `meeting`: they
 * are different bookings, and merging them would offer one block that edits
 * whichever happened to be first.
 */
export function mergeRuns(cells: AvailabilityCell[]): AvailabilityRun[] {
  const runs: { state: RunState; cells: AvailabilityCell[]; from: number }[] = [];

  cells.forEach((cell, index) => {
    const state = runState(cell);
    const last = runs[runs.length - 1];
    const sameMeeting =
      state !== 'meeting' || (last?.cells[0]?.meeting?.id ?? null) === (cell.meeting?.id ?? null);

    if (last && last.state === state && sameMeeting) {
      last.cells.push(cell);
      return;
    }
    runs.push({ state, cells: [cell], from: index });
  });

  return runs.map((run) => ({
    state: run.state,
    start: run.cells[0].start,
    end: run.cells[run.cells.length - 1].end,
    from: run.from,
    length: run.cells.length,
    meeting: run.cells[0].meeting,
    ...runPeople(run.cells),
  }));
}
