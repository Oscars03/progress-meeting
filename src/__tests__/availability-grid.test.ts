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

  const cellAt = (grid: ReturnType<typeof buildWeekGrid>, date: string, hour: number) =>
    grid.find((d) => d.date === date)!.cells.find((c) => c.hour === hour)!;

  it('builds one cell per hour per day', () => {
    const grid = buildWeekGrid({ weekStart: '2026-09-14', fromHour: 8, toHour: 20, people: [] });
    expect(grid).toHaveLength(7);
    expect(grid[0].cells).toHaveLength(12);
    expect(grid[0].cells[0].start).toBe('2026-09-14T08:00:00+07:00');
    expect(grid[0].cells[11].end).toBe('2026-09-14T20:00:00+07:00');
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

    const tenOClock = cellAt(grid, '2026-09-14', 10);
    expect(tenOClock).toMatchObject({ busy: ['Ann'], free: ['Bo'], unknown: ['Cy'], status: 'some-busy' });

    const nineOClock = cellAt(grid, '2026-09-14', 9);
    expect(nineOClock).toMatchObject({ busy: [], free: ['Ann', 'Bo'], unknown: ['Cy'], status: 'incomplete' });
  });

  it('marks a slot green only when every known person is free', () => {
    const grid = buildWeekGrid({
      weekStart: '2026-09-14',
      fromHour: 9,
      toHour: 10,
      people: [person('Ann', true), person('Bo', true)],
    });
    expect(cellAt(grid, '2026-09-14', 9).status).toBe('all-free');
  });

  it('does not count a meeting that ends exactly when the slot starts', () => {
    const grid = buildWeekGrid({
      weekStart: '2026-09-14',
      fromHour: 11,
      toHour: 12,
      people: [person('Ann', true, [['2026-09-14T10:00:00+07:00', '2026-09-14T11:00:00+07:00']])],
    });
    expect(cellAt(grid, '2026-09-14', 11).status).toBe('all-free');
  });

  it('counts someone busy for the part of an hour they are away', () => {
    const grid = buildWeekGrid({
      weekStart: '2026-09-14',
      fromHour: 14,
      toHour: 15,
      people: [person('Ann', true, [['2026-09-14T14:50:00+07:00', '2026-09-14T15:10:00+07:00']])],
    });
    expect(cellAt(grid, '2026-09-14', 14).busy).toEqual(['Ann']);
  });

  it('places busy time given in UTC into the right lab hour', () => {
    // 03:00 UTC is 10:00 in Bangkok.
    const grid = buildWeekGrid({
      weekStart: '2026-09-14',
      fromHour: 9,
      toHour: 11,
      people: [person('Ann', true, [['2026-09-14T03:00:00Z', '2026-09-14T04:00:00Z']])],
    });
    expect(cellAt(grid, '2026-09-14', 9).status).toBe('all-free');
    expect(cellAt(grid, '2026-09-14', 10).status).toBe('some-busy');
  });
});
