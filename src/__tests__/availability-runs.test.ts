import { describe, it, expect } from 'vitest';
import { mergeRuns, runState } from '../lib/availability-runs';
import type { AvailabilityCell, CellMeeting } from '../lib/availability-grid';

/** A cell at `hour`, with whoever is free and whoever is not. */
function cell(
  hour: number,
  minute: 0 | 30,
  parts: Partial<Pick<AvailabilityCell, 'free' | 'busy' | 'unknown' | 'status' | 'meeting'>>
): AvailabilityCell {
  const at = (h: number, m: number) =>
    `2026-09-14T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`;
  const endMinute = minute === 0 ? 30 : 0;
  const endHour = minute === 0 ? hour : hour + 1;

  return {
    start: at(hour, minute),
    end: at(endHour, endMinute),
    hour,
    minute,
    free: [],
    busy: [],
    unknown: [],
    status: 'all-free',
    meeting: null,
    ...parts,
  };
}

const meeting: CellMeeting = {
  id: 'm1',
  title: 'ประชุมความคืบหน้า',
  startAt: '2026-09-14T10:00:00+07:00',
  endAt: '2026-09-14T11:00:00+07:00',
  rowVersion: 1,
};

describe('runState', () => {
  // The headcount is gone from the grid: a block says free, busy or booked.
  it('reads three states and nothing between them', () => {
    expect(runState(cell(8, 0, { status: 'all-free' }))).toBe('free');
    expect(runState(cell(8, 0, { status: 'some-busy' }))).toBe('busy');
    expect(runState(cell(8, 0, { status: 'meeting', meeting }))).toBe('meeting');
  });

  // With two of eight never connected, `incomplete` covered nearly every hour
  // the lab could actually meet in. Nobody known to be busy is free.
  it('counts an hour nobody is busy in as free, even with somebody unaccounted for', () => {
    expect(runState(cell(8, 0, { status: 'incomplete', unknown: ['Kandis'] }))).toBe('free');
  });
});

describe('mergeRuns', () => {
  it('merges the whole afternoon that used to be seven different numbers', () => {
    // 5/8, 3/8, 4/8, 3/8 -- four counts, one fact: somebody cannot make it.
    const cells = [
      cell(13, 0, { status: 'some-busy', free: ['a', 'b', 'c', 'd', 'e'], busy: ['f', 'g', 'h'] }),
      cell(13, 30, { status: 'some-busy', free: ['a', 'b', 'c'], busy: ['d', 'e', 'f', 'g', 'h'] }),
      cell(14, 0, { status: 'some-busy', free: ['a', 'b', 'c', 'd'], busy: ['e', 'f', 'g', 'h'] }),
      cell(14, 30, { status: 'some-busy', free: ['a', 'b', 'c'], busy: ['d', 'e', 'f', 'g', 'h'] }),
    ];

    const runs = mergeRuns(cells);

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ state: 'busy', from: 0, length: 4 });
    expect(runs[0].start).toBe('2026-09-14T13:00:00+07:00');
    expect(runs[0].end).toBe('2026-09-14T15:00:00+07:00');
  });

  it('breaks where the state changes, and keeps each run positioned', () => {
    const cells = [
      cell(8, 0, { status: 'all-free' }),
      cell(8, 30, { status: 'all-free' }),
      cell(9, 0, { status: 'some-busy', busy: ['f'] }),
      cell(9, 30, { status: 'all-free' }),
    ];

    const runs = mergeRuns(cells);

    expect(runs.map((r) => [r.state, r.from, r.length])).toEqual([
      ['free', 0, 2],
      ['busy', 2, 1],
      ['free', 3, 1],
    ]);
  });

  /**
   * Free means free for the whole stretch. A run is offered as one block, and
   * somebody free for half of it cannot take the meeting.
   */
  it('counts as free only whoever is free in every cell', () => {
    const cells = [
      cell(8, 0, { status: 'some-busy', free: ['a', 'b'], busy: ['c'] }),
      cell(8, 30, { status: 'some-busy', free: ['a'], busy: ['b', 'c'] }),
    ];

    const [run] = mergeRuns(cells);

    expect(run.free).toEqual(['a']);
    expect(run.busy.sort()).toEqual(['b', 'c']);
  });

  it('reports whoever never answered as unknown rather than free', () => {
    const cells = [
      cell(8, 0, { status: 'incomplete', free: ['a'], unknown: ['z'] }),
      cell(8, 30, { status: 'incomplete', free: ['a'], unknown: ['z'] }),
    ];

    const [run] = mergeRuns(cells);

    expect(run.state).toBe('free');
    expect(run.free).toEqual(['a']);
    expect(run.unknown).toEqual(['z']);
  });

  // Two bookings in a row are two blocks: merging them would offer one block
  // that edits whichever happened to be first.
  it('does not merge two different meetings that touch', () => {
    const other: CellMeeting = { ...meeting, id: 'm2', title: 'อีกนัดหนึ่ง' };
    const cells = [
      cell(10, 0, { status: 'meeting', meeting }),
      cell(10, 30, { status: 'meeting', meeting }),
      cell(11, 0, { status: 'meeting', meeting: other }),
    ];

    const runs = mergeRuns(cells);

    expect(runs).toHaveLength(2);
    expect(runs[0].meeting?.id).toBe('m1');
    expect(runs[0].length).toBe(2);
    expect(runs[1].meeting?.id).toBe('m2');
  });

  it('has nothing to say about an empty day', () => {
    expect(mergeRuns([])).toEqual([]);
  });
});
