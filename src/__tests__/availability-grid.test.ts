import { describe, it, expect } from 'vitest';
import {
  addDays,
  buildWeekGrid,
  cellStatus,
  isIsoDate,
  labDate,
  mondayOf,
  slotStart,
  weekDates,
  type Interval,
  type PersonAvailability,
} from '../lib/availability-grid';

const at = (iso: string) => Date.parse(iso);

describe('dates', () => {
  it('finds the Monday of the week', () => {
    expect(mondayOf('2026-09-13')).toBe('2026-09-07'); // Sunday
    expect(mondayOf('2026-09-14')).toBe('2026-09-14'); // Monday
    expect(mondayOf('2026-09-16')).toBe('2026-09-14'); // Wednesday
  });

  it('lists seven consecutive days, across a month boundary', () => {
    expect(weekDates('2026-09-28')).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
  });

  it('adds days across a year boundary', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('reads the lab date, not the UTC date, near midnight', () => {
    // 20:00 UTC is already 03:00 the next day in Bangkok.
    expect(labDate(at('2026-09-13T20:00:00Z'))).toBe('2026-09-14');
  });

  it('builds slot instants in the lab offset', () => {
    const start = slotStart('2026-09-14', 10);
    expect(start).toBe('2026-09-14T10:00:00+07:00');
    expect(new Date(start).toISOString()).toBe('2026-09-14T03:00:00.000Z');
  });

  it('rolls hour 24 into the next day', () => {
    expect(slotStart('2026-09-14', 24)).toBe('2026-09-15T00:00:00+07:00');
  });

  it('validates date strings', () => {
    expect(isIsoDate('2026-09-14')).toBe(true);
    expect(isIsoDate('2026-9-14')).toBe(false);
    expect(isIsoDate('not a date')).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
});

describe('cellStatus', () => {
  it('is all-free only when everyone is known and free', () => {
    expect(cellStatus(0, 0, 3)).toBe('all-free');
  });

  it('is some-busy as soon as one person is busy, known or not', () => {
    expect(cellStatus(1, 0, 3)).toBe('some-busy');
    expect(cellStatus(1, 2, 3)).toBe('some-busy');
  });

  it('is incomplete when nobody is busy but someone is unknown', () => {
    expect(cellStatus(0, 1, 3)).toBe('incomplete');
  });

  it('does not call an empty group free', () => {
    expect(cellStatus(0, 0, 0)).toBe('incomplete');
  });
});

describe('buildWeekGrid', () => {
  const person = (name: string, known: boolean, busy: [string, string][] = []): PersonAvailability => ({
    id: name,
    name,
    known,
    busy: busy.map(([s, e]) => ({ start: at(s), end: at(e) })),
  });

  /** Addressed by wall clock, because there are now two cells per hour. */
  const cellAt = (grid: ReturnType<typeof buildWeekGrid>, date: string, time: string) =>
    grid.find((d) => d.date === date)!.cells.find((c) => c.start.slice(11, 16) === time)!;

  it('builds one cell per hour per day', () => {
    const grid = buildWeekGrid({ weekStart: '2026-09-14', fromHour: 8, toHour: 20, people: [] });
    expect(grid).toHaveLength(7);
    expect(grid[0].cells).toHaveLength(12);
    expect(grid[0].cells[0].start).toBe('2026-09-14T08:00:00+07:00');
    expect(grid[0].cells[1].start).toBe('2026-09-14T09:00:00+07:00');
    expect(grid[0].cells[11].end).toBe('2026-09-14T20:00:00+07:00');
  });

  it('carries the last slot of the day into the next one', () => {
    const grid = buildWeekGrid({ weekStart: '2026-09-14', fromHour: 23, toHour: 24, people: [] });
    expect(grid[0].cells[0].start).toBe('2026-09-14T23:00:00+07:00');
    expect(grid[0].cells[0].end).toBe('2026-09-15T00:00:00+07:00');
  });

  // The machinery is still there; the grid just does not ask for it. A half
  // hour is picked on the calendar, not here.
  it('can still be built in half hours', () => {
    const grid = buildWeekGrid({
      weekStart: '2026-09-14',
      fromHour: 8,
      toHour: 20,
      stepMinutes: 30,
      people: [],
    });
    expect(grid[0].cells).toHaveLength(24);
    expect(grid[0].cells[1].start).toBe('2026-09-14T08:30:00+07:00');
  });

  it('sorts each person into free, busy or unknown', () => {
    const grid = buildWeekGrid({
      weekStart: '2026-09-14',
      fromHour: 9,
      toHour: 12,
      people: [
        person('Ann', true, [['2026-09-14T10:30:00+07:00', '2026-09-14T11:30:00+07:00']]),
        person('Bo', true),
        person('Cy', false),
      ],
    });

    // Ann is away for part of 10:00, which is enough to hold the hour.
    const tenOClock = cellAt(grid, '2026-09-14', '10:00');
    expect(tenOClock).toMatchObject({ busy: ['Ann'], free: ['Bo'], unknown: ['Cy'], status: 'some-busy' });

    const nineOClock = cellAt(grid, '2026-09-14', '09:00');
    expect(nineOClock).toMatchObject({ busy: [], free: ['Ann', 'Bo'], unknown: ['Cy'], status: 'incomplete' });
  });

  it('marks a slot green only when every known person is free', () => {
    const grid = buildWeekGrid({
      weekStart: '2026-09-14',
      fromHour: 9,
      toHour: 10,
      people: [person('Ann', true), person('Bo', true)],
    });
    expect(cellAt(grid, '2026-09-14', '09:00').status).toBe('all-free');
  });

  it('does not count a meeting that ends exactly when the slot starts', () => {
    const grid = buildWeekGrid({
      weekStart: '2026-09-14',
      fromHour: 11,
      toHour: 12,
      people: [person('Ann', true, [['2026-09-14T10:00:00+07:00', '2026-09-14T11:00:00+07:00']])],
    });
    expect(cellAt(grid, '2026-09-14', '11:00').status).toBe('all-free');
  });

  it('counts someone busy for the part of an hour they are away', () => {
    const grid = buildWeekGrid({
      weekStart: '2026-09-14',
      fromHour: 14,
      toHour: 15,
      people: [person('Ann', true, [['2026-09-14T14:50:00+07:00', '2026-09-14T15:10:00+07:00']])],
    });
    expect(cellAt(grid, '2026-09-14', '14:00').busy).toEqual(['Ann']);
  });

  it('places busy time given in UTC into the right lab hour', () => {
    // 03:00 UTC is 10:00 in Bangkok.
    const grid = buildWeekGrid({
      weekStart: '2026-09-14',
      fromHour: 9,
      toHour: 11,
      people: [person('Ann', true, [['2026-09-14T03:00:00Z', '2026-09-14T04:00:00Z']])],
    });
    expect(cellAt(grid, '2026-09-14', '09:00').status).toBe('all-free');
    expect(cellAt(grid, '2026-09-14', '10:00').status).toBe('some-busy');
  });

  describe('a slot a meeting already holds', () => {
    const booked = {
      id: 'm1',
      title: 'Progress meeting',
      start: at('2026-09-14T13:00:00+07:00'),
      end: at('2026-09-14T14:00:00+07:00'),
      rowVersion: 7,
    };

    const grid = () =>
      buildWeekGrid({
        weekStart: '2026-09-14',
        fromHour: 12,
        toHour: 15,
        people: [person('Ann', true), person('Bo', true)],
        meetings: [booked],
      });

    it('is reported as the meeting rather than as free time', () => {
      const cell = cellAt(grid(), '2026-09-14', '13:00');
      expect(cell.status).toBe('meeting');
      expect(cell.meeting).toMatchObject({ id: 'm1', title: 'Progress meeting', rowVersion: 7 });
    });

    it('covers the hours the meeting spans, and no more', () => {
      const day = grid();
      // Touching is not overlapping: a meeting ending at 14:00 leaves it free.
      expect(cellAt(day, '2026-09-14', '14:00').status).toBe('all-free');
      expect(cellAt(day, '2026-09-14', '12:00').status).toBe('all-free');
    });

    it('carries the version that was read, so the slot can be moved', () => {
      // Writes refuse a version they did not read; the grid is that read.
      expect(cellAt(grid(), '2026-09-14', '13:00').meeting?.rowVersion).toBe(7);
    });

    it('leaves every other slot without a meeting', () => {
      expect(cellAt(grid(), '2026-09-14', '12:00').meeting).toBeNull();
    });

    /**
     * A meeting cannot be the reason nobody can attend it.
     *
     * Once confirmed, the meeting is written into the diary of everyone it
     * holds -- into the app, and onto the Google calendar of anybody who
     * connected one. Both came back as "busy" for the hour the meeting
     * occupies, so a settled meeting read as its own attendees being
     * unavailable for it.
     */
    describe('does not make its own attendees busy for it', () => {
      const attending = (name: string, busy: Interval[]): PersonAvailability => ({
        id: name,
        name,
        known: true,
        busy,
      });

      const gridWith = (people: PersonAvailability[]) =>
        buildWeekGrid({
          weekStart: '2026-09-14',
          fromHour: 12,
          toHour: 15,
          people,
          meetings: [booked],
        });

      it('ignores the commitment the app recorded for this meeting', () => {
        const day = gridWith([
          attending('Ann', [{ start: booked.start, end: booked.end, meetingId: 'm1' }]),
        ]);
        expect(cellAt(day, '2026-09-14', '13:00').busy).toEqual([]);
        expect(cellAt(day, '2026-09-14', '13:00').free).toEqual(['Ann']);
      });

      it('ignores the same hour coming back from Google, which carries no id', () => {
        const day = gridWith([attending('Bo', [{ start: booked.start, end: booked.end }])]);
        expect(cellAt(day, '2026-09-14', '13:00').busy).toEqual([]);
      });

      it('ignores a different meeting only where that meeting is', () => {
        // Somebody held by a *different* meeting during this one is still
        // held by it as far as any other hour is concerned.
        const other = { start: at('2026-09-14T12:00:00+07:00'), end: at('2026-09-14T13:00:00+07:00'), meetingId: 'm2' };
        const day = gridWith([attending('Cy', [other])]);
        expect(cellAt(day, '2026-09-14', '12:00').busy).toEqual(['Cy']);
        expect(cellAt(day, '2026-09-14', '13:00').busy).toEqual([]);
      });

      it('still reports a clash that runs past the meeting', () => {
        // Not contained in it, so it is plainly something else -- an afternoon
        // out that happens to start when the meeting does.
        const day = gridWith([
          attending('Di', [
            { start: at('2026-09-14T13:00:00+07:00'), end: at('2026-09-14T17:00:00+07:00') },
          ]),
        ]);
        expect(cellAt(day, '2026-09-14', '13:00').busy).toEqual(['Di']);
      });

      it('leaves hours with no meeting judged exactly as before', () => {
        const day = gridWith([
          attending('Ed', [
            { start: at('2026-09-14T12:00:00+07:00'), end: at('2026-09-14T12:30:00+07:00') },
          ]),
        ]);
        expect(cellAt(day, '2026-09-14', '12:00').busy).toEqual(['Ed']);
      });
    });
  });
});
