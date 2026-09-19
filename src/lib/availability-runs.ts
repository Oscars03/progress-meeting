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
  unknown: string[];
};

/**
 * An hour where nobody is known to be busy counts as free, whether or not
 * everyone has been accounted for.
 *
 * `incomplete` -- nobody busy, but somebody never connected a calendar -- was
 * its own grey state. With two of eight unconnected it covered nearly every
 * hour the lab could actually meet in, so the one colour that meant "this is
 * possible" was a colour that also meant "we are not sure". Whether anybody is
 * unaccounted for is a fact about the run, and it is told by name in the
 * panel rather than by tinting the block.
 */
export function runState(cell: AvailabilityCell): RunState {
  if (cell.status === 'meeting') return 'meeting';
  return cell.status === 'some-busy' ? 'busy' : 'free';
}

/**
 * Who is free for the *whole* run, and who is not.
 *
 * Free means free in every cell of it: a run is offered as one stretch, and
 * somebody free for half of it cannot take the meeting. Busy is the opposite
 * -- busy anywhere is busy -- and whoever is in neither list never answered.
 */
function runPeople(cells: AvailabilityCell[]): Pick<AvailabilityRun, 'free' | 'busy' | 'unknown'> {
  const busy = new Set<string>();
  const seen = new Set<string>();
  // Null until the first cell, which seeds it: an empty set would intersect
  // to nothing and report that nobody is ever free.
  let free: Set<string> | null = null;
  const narrow = (a: Set<string>, b: Set<string>) => new Set([...a].filter((name) => b.has(name)));

  for (const cell of cells) {
    for (const name of cell.busy) busy.add(name);
    for (const name of [...cell.free, ...cell.busy, ...cell.unknown]) seen.add(name);

    const here = new Set(cell.free);
    free = free === null ? here : narrow(free, here);
  }

  const freeAll = [...(free ?? new Set<string>())].filter((name) => !busy.has(name));
  const accounted = new Set([...freeAll, ...busy]);
  return {
    free: freeAll,
    busy: [...busy],
    unknown: [...seen].filter((name) => !accounted.has(name)),
  };
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
