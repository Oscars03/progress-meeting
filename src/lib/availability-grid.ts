/**
 * The weekly availability grid: who is free, busy or unknown for each hour.
 *
 * Pure -- no I/O -- so the colour rules can be tested directly. The server
 * action gathers busy intervals from Google Calendar and from meetings in the
 * app, and hands them here.
 */

/**
 * Cells are wall-clock hours in the lab's zone, never the server's. The clock
 * itself now lives in lib/lab-time.ts, which every other path that accepts a
 * typed-in time also uses; re-exported here so this module's callers are
 * unchanged.
 */
export { LAB_TIME_ZONE, LAB_UTC_OFFSET } from './lab-time';
import { LAB_UTC_OFFSET } from './lab-time';

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
 * meeting:    a confirmed meeting already holds this slot. It outranks the
 *             other three: once the time is settled, what the grid has to say
 *             about it is that it is taken, not how many people were free
 *             before it was booked.
 */
export type CellStatus = 'all-free' | 'some-busy' | 'incomplete' | 'meeting';

/**
 * A meeting already in the diary, as the grid needs to know it.
 *
 * It carries its own row version so the cell can offer to move it: that is the
 * version this read returned, which is the only one a write is allowed to use.
 * A stale one is refused rather than silently overwriting somebody else.
 */
export type GridMeeting = {
  id: string;
  title: string;
  /** Epoch milliseconds, like every other interval here. */
  start: number;
  end: number;
  rowVersion: number;
};

/** What a cell reports about the meeting holding it. */
export type CellMeeting = {
  id: string;
  title: string;
  /** The meeting's own span, which is usually longer than the cell. */
  startAt: string;
  endAt: string;
  rowVersion: number;
};

export type AvailabilityCell = {
  /** ISO instant with the lab offset, e.g. 2026-09-14T10:30:00+07:00. */
  start: string;
  end: string;
  hour: number;
  /** Minutes past the hour: 0 or 30 at the default half-hour step. */
  minute: number;
  free: string[];
  busy: string[];
  unknown: string[];
  status: CellStatus;
  /** The confirmed meeting holding this slot, if there is one. */
  meeting: CellMeeting | null;
};

export type AvailabilityDay = { date: string; cells: AvailabilityCell[] };

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

/**
 * The instant a slot begins.
 *
 * `minute` may be 60 or more -- the end of the 21:30 slot is written as 21:60
 * by the caller that stepped past it -- and the hour carries, then the day. So
 * the last slot of a day ends at midnight of the next one rather than at an
 * hour that does not exist.
 */
export function slotStart(
  date: string,
  hour: number,
  offset: string = LAB_UTC_OFFSET,
  minute = 0
): string {
  const h = hour + Math.floor(minute / 60);
  const m = ((minute % 60) + 60) % 60;
  if (h >= 24) return slotStart(addDays(date, 1), h - 24, offset, m);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date}T${pad(h)}:${pad(m)}:00${offset}`;
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

/**
 * `stepMinutes` is how long one cell is. Half an hour, because a lab meeting
 * that starts at 11:30 is an ordinary thing to want and a grid of whole hours
 * could not express it -- the hour was the only reason 11:30 was unpickable,
 * never a property of anyone's calendar.
 */
export function buildWeekGrid(input: {
  weekStart: string;
  days?: number;
  fromHour: number;
  toHour: number;
  stepMinutes?: number;
  offset?: string;
  people: PersonAvailability[];
  meetings?: GridMeeting[];
}): AvailabilityDay[] {
  const offset = input.offset ?? LAB_UTC_OFFSET;
  const step = input.stepMinutes ?? 30;
  const stepMs = step * 60_000;
  const meetings = input.meetings ?? [];

  const spanMinutes = (input.toHour - input.fromHour) * 60;
  const starts = Array.from({ length: Math.max(0, Math.floor(spanMinutes / step)) }, (_, i) => ({
    hour: input.fromHour + Math.floor((i * step) / 60),
    minute: (i * step) % 60,
  }));

  return weekDates(input.weekStart, input.days ?? 7).map((date) => ({
    date,
    cells: starts.map(({ hour, minute }) => {
      const start = slotStart(date, hour, offset, minute);
      const startMs = Date.parse(start);
      const endMs = startMs + stepMs;

      const free: string[] = [];
      const busy: string[] = [];
      const unknown: string[] = [];

      for (const person of input.people) {
        if (person.busy.some((b) => overlaps(startMs, endMs, b))) busy.push(person.name);
        else if (person.known) free.push(person.name);
        else unknown.push(person.name);
      }

      const meeting = meetings.find((m) => overlaps(startMs, endMs, m)) ?? null;

      return {
        start,
        end: slotStart(date, hour, offset, minute + step),
        hour,
        minute,
        free,
        busy,
        unknown,
        status: meeting ? ('meeting' as const) : cellStatus(busy.length, unknown.length, input.people.length),
        meeting: meeting
          ? {
              id: meeting.id,
              title: meeting.title,
              startAt: new Date(meeting.start).toISOString(),
              endAt: new Date(meeting.end).toISOString(),
              rowVersion: meeting.rowVersion,
            }
          : null,
      };
    }),
  }));
}
