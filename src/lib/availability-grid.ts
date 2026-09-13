/**
 * The weekly availability grid: who is free, busy or unknown for each hour.
 *
 * Pure -- no I/O -- so the colour rules can be tested directly. The server
 * action gathers busy intervals from Google Calendar and from meetings in the
 * app, and hands them here.
 */

export const LAB_TIME_ZONE = 'Asia/Bangkok';

/**
 * Cells are wall-clock hours in the lab's zone, never the server's. On a host
 * running in UTC, "10:00" built from the server clock would land at 17:00 for
 * the people reading it. Thailand keeps no daylight saving, so a fixed offset
 * is exact all year.
 */
export const LAB_UTC_OFFSET = '+07:00';

export type Interval = { start: number; end: number };

export type PersonAvailability = {
  id: string;
  name: string;
  /**
   * True only when this person's whole calendar could be read. Without it, the
   * absence of a busy interval proves nothing -- they may simply not have told
   * the app about their day.
   */
  known: boolean;
  busy: Interval[];
};

/**
 * all-free:   every person is known and none is busy.
 * some-busy:  at least one person is busy.
 * incomplete: nobody is busy, but at least one person's calendar is unknown,
 *             so "everyone is free" cannot honestly be claimed.
 */
export type CellStatus = 'all-free' | 'some-busy' | 'incomplete';

export type AvailabilityCell = {
  /** ISO instant with the lab offset, e.g. 2026-09-14T10:00:00+07:00. */
  start: string;
  end: string;
  hour: number;
  free: string[];
  busy: string[];
  unknown: string[];
  status: CellStatus;
};

export type AvailabilityDay = { date: string; cells: AvailabilityCell[] };

const HOUR_MS = 3_600_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    DATE_RE.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
  );
}

function offsetMinutes(offset: string): number {
  const m = offset.match(/^([+-])(\d{2}):(\d{2})$/);
  if (!m) throw new Error(`Invalid UTC offset: ${offset}`);
  const minutes = Number(m[2]) * 60 + Number(m[3]);
  return m[1] === '-' ? -minutes : minutes;
}

/** The calendar date, in the lab's zone, of an instant. */
export function labDate(instantMs: number, offset: string = LAB_UTC_OFFSET): string {
  return new Date(instantMs + offsetMinutes(offset) * 60_000).toISOString().slice(0, 10);
}

/**
 * Date arithmetic on YYYY-MM-DD strings, anchored at UTC noon so no zone or
 * daylight-saving shift can move the result across midnight.
 */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. Weeks run Monday to Sunday. */
export function mondayOf(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const weekday = d.getUTCDay() || 7;
  return addDays(date, -(weekday - 1));
}

export function weekDates(weekStart: string, days = 7): string[] {
  return Array.from({ length: days }, (_, i) => addDays(weekStart, i));
}

export function slotStart(date: string, hour: number, offset: string = LAB_UTC_OFFSET): string {
  if (hour === 24) return slotStart(addDays(date, 1), 0, offset);
  return `${date}T${String(hour).padStart(2, '0')}:00:00${offset}`;
}

/** Touching is not overlapping: a meeting ending at 11:00 leaves 11:00 free. */
function overlaps(start: number, end: number, interval: Interval): boolean {
  return start < interval.end && interval.start < end;
}

export function cellStatus(busy: number, unknown: number, people: number): CellStatus {
  if (busy > 0) return 'some-busy';
  // With nobody to ask, nobody is known to be free either.
  if (unknown > 0 || people === 0) return 'incomplete';
  return 'all-free';
}

export function buildWeekGrid(input: {
  weekStart: string;
  days?: number;
  fromHour: number;
  toHour: number;
  offset?: string;
  people: PersonAvailability[];
}): AvailabilityDay[] {
  const offset = input.offset ?? LAB_UTC_OFFSET;
  const hours = Array.from({ length: input.toHour - input.fromHour }, (_, i) => input.fromHour + i);

  return weekDates(input.weekStart, input.days ?? 7).map((date) => ({
    date,
    cells: hours.map((hour) => {
      const start = slotStart(date, hour, offset);
      const startMs = Date.parse(start);
      const endMs = startMs + HOUR_MS;

      const free: string[] = [];
      const busy: string[] = [];
      const unknown: string[] = [];

      for (const person of input.people) {
        if (person.busy.some((b) => overlaps(startMs, endMs, b))) busy.push(person.name);
        else if (person.known) free.push(person.name);
        else unknown.push(person.name);
      }

      return {
        start,
        end: slotStart(date, hour + 1, offset),
        hour,
        free,
        busy,
        unknown,
        status: cellStatus(busy.length, unknown.length, input.people.length),
      };
    }),
  }));
}
