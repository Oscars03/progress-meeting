import { createHash, randomBytes } from 'node:crypto';
import { weekStartDate } from './week';
import { LAB_UTC_OFFSET } from './lab-time';
import { clip, splitSaraAm } from './widget-svg';
import type { CalendarShareRecord } from './db/schema';

/**
 * A week of the lab's busy hours, shown to whoever holds a link.
 *
 * The link is the only key: 32 random bytes, of which only the SHA-256 is
 * stored, the same as the widget's keys. It shows *when* the chosen people
 * are busy and never *what* -- the same rule the calendar keeps for anybody
 * looking at somebody else's week -- and it stops working after
 * SHARE_TTL_DAYS or as soon as it is withdrawn.
 */

export const SHARE_TTL_DAYS = 30;
const TOKEN_PREFIX = 'pmc_';

export function generateShareToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

export function hashShareToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Whether a link still shows its week: not withdrawn and not past its date. */
export function shareIsLive(share: Pick<CalendarShareRecord, 'expires_at' | 'revoked_at'>, now: Date = new Date()): boolean {
  if (share.revoked_at) return false;
  const until = Date.parse(share.expires_at);
  return !Number.isNaN(until) && now.getTime() < until;
}

/** The hours drawn: the same 08:00-22:00 the calendar shows. */
export const DAY_FROM = 8 * 60;
export const DAY_TO = 22 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export type Interval = { start: string; end: string };
/** Part of an interval on one day of the week, in minutes past midnight. */
export type Segment = { day: number; from: number; to: number };

/** Midnight in the lab at the start of each day of the week, Monday first. */
export function weekDays(key: string): number[] {
  const monday = weekStartDate(key);
  if (!monday) return [];
  const first = Date.parse(`${monday}T00:00:00${LAB_UTC_OFFSET}`);
  return Array.from({ length: 7 }, (_, d) => first + d * DAY_MS);
}

/**
 * Cut intervals to the drawn hours of each day of the week, merging any that
 * overlap. An interval running past midnight lands on both days it touches.
 */
export function segmentsInWeek(intervals: Interval[], key: string): Segment[] {
  const days = weekDays(key);
  const out: Segment[] = [];
  days.forEach((midnight, day) => {
    const lo = midnight + DAY_FROM * 60_000;
    const hi = midnight + DAY_TO * 60_000;
    const pieces = intervals
      .map((i) => [Math.max(Date.parse(i.start), lo), Math.min(Date.parse(i.end), hi)] as const)
      .filter(([s, e]) => !Number.isNaN(s) && !Number.isNaN(e) && e > s)
      .sort((a, b) => a[0] - b[0]);
    let current: [number, number] | null = null;
    for (const [s, e] of pieces) {
      if (current && s <= current[1]) current[1] = Math.max(current[1], e);
      else {
        if (current) out.push(toSegment(day, midnight, current));
        current = [s, e];
      }
    }
    if (current) out.push(toSegment(day, midnight, current));
  });
  return out;
}

function toSegment(day: number, midnight: number, [s, e]: [number, number]): Segment {
  return { day, from: Math.round((s - midnight) / 60_000), to: Math.round((e - midnight) / 60_000) };
}

/** The drawn hours of each day in which none of the given rows is busy. */
export function freeTogether(rows: Segment[][]): Segment[] {
  const out: Segment[] = [];
  for (let day = 0; day < 7; day++) {
    const busy = rows
      .flat()
      .filter((s) => s.day === day)
      .sort((a, b) => a.from - b.from);
    let at = DAY_FROM;
    for (const s of busy) {
      if (s.from > at) out.push({ day, from: at, to: s.from });
      at = Math.max(at, s.to);
    }
    if (at < DAY_TO) out.push({ day, from: at, to: DAY_TO });
  }
  return out;
}

/** Light-theme fill and edge for each avatar colour (globals.css --av-*). */
const AV: Record<string, [string, string]> = {
  red: ['#fee2e2', '#991b1b'],
  orange: ['#ffedd5', '#9a3412'],
  amber: ['#fef3c7', '#92400e'],
  lime: ['#ecfccb', '#3f6212'],
  green: ['#dcfce7', '#166534'],
  teal: ['#ccfbf1', '#115e59'],
  cyan: ['#cffafe', '#155e75'],
  blue: ['#dbeafe', '#1e40af'],
  indigo: ['#e0e7ff', '#3730a3'],
  violet: ['#ede9fe', '#5b21b6'],
  pink: ['#fce7f3', '#9d174d'],
  fuchsia: ['#fae8ff', '#86198f'],
  brown: ['#efe4d6', '#6b3f1d'],
  slate: ['#e2e8f0', '#334155'],
};

function esc(value: string): string {
  return splitSaraAm(value).replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string
  );
}

export type ShareRow = { name: string; color: string; busy: Segment[] };

export type ShareLabels = {
  title: string;
  range: string;
  days: string[];
  lab: string;
  meetings: string;
  free: string;
  note: string;
};

/** "08:00" for 480 minutes past midnight. */
export function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** A box to draw: one busy period of one person (or the lab), on one day. */
type Box = Segment & { name: string; fill: string; edge: string; ink: string; lane: number; lanes: number };

/**
 * Side by side where they overlap, full width where they do not -- the way a
 * calendar app lays out a day. Boxes that overlap, directly or through a
 * chain, form a group; each takes the first lane free at its start, and the
 * group's width is shared between as many lanes as it needed.
 */
export function layOut<T extends Segment>(boxes: T[]): (T & { lane: number; lanes: number })[] {
  const out: (T & { lane: number; lanes: number })[] = [];
  for (let day = 0; day < 7; day++) {
    const today = boxes.filter((b) => b.day === day).sort((a, b) => a.from - b.from || b.to - a.to);
    let group: (T & { lane: number; lanes: number })[] = [];
    let laneEnds: number[] = [];
    let groupEnd = -1;
    const close = () => {
      for (const b of group) b.lanes = laneEnds.length;
      out.push(...group);
      group = [];
      laneEnds = [];
    };
    for (const box of today) {
      if (box.from >= groupEnd && group.length) close();
      let lane = laneEnds.findIndex((end) => end <= box.from);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(box.to);
      } else laneEnds[lane] = box.to;
      group.push({ ...box, lane, lanes: 1 });
      groupEnd = Math.max(groupEnd, box.to);
    }
    if (group.length) close();
  }
  return out;
}

/**
 * The week as one picture, laid out like the calendar in the app: a column
 * per day, the hours from 08:00 to 22:00 running down the side, and a box in
 * each person's own colour for every period they are busy, with their name
 * and the times written in it. The lab's meetings are boxes of their own;
 * the hours when everybody shown is free are tinted green behind it all,
 * which is usually what the picture is for.
 *
 * Drawn for resvg as much as for a browser, so the same SVG is the shared
 * page and the downloaded PNG: plain shapes, one font, Thai sara am split
 * beforehand (see splitSaraAm).
 */
export function renderShareSvg(input: { rows: ShareRow[]; meetings: Segment[]; labels: ShareLabels }): string {
  const { rows, meetings, labels } = input;
  const W = 1400;
  const pad = 28;
  const timeW = 64;
  const dayW = (W - pad * 2 - timeW) / 7;
  const hourH = 56;
  const gridTop = 150;
  const gridH = ((DAY_TO - DAY_FROM) / 60) * hourH;
  const left = pad + timeW;
  const y = (minute: number) => gridTop + ((minute - DAY_FROM) / 60) * hourH;
  const dayX = (day: number) => left + day * dayW;

  const boxes: Box[] = layOut([
    ...meetings.map((s) => ({ ...s, name: labels.meetings, fill: '#dbeafe', edge: '#1d4ed8', ink: '#1e3a8a' })),
    ...rows.flatMap((r) => {
      const [fill, edge] = AV[r.color] ?? AV.slate;
      return r.busy.map((s) => ({ ...s, name: r.name, fill, edge, ink: edge }));
    }),
  ]);
  const free = freeTogether(rows.map((r) => r.busy).concat([meetings]));

  // The key under the grid: everybody shown, in their colour, wrapped to
  // as many lines as it takes.
  const keyItems = [
    { name: labels.meetings, fill: '#dbeafe', edge: '#1d4ed8' },
    ...rows.map((r) => ({ name: r.name, fill: (AV[r.color] ?? AV.slate)[0], edge: (AV[r.color] ?? AV.slate)[1] })),
    { name: labels.free, fill: '#dcfce7', edge: '#86efac' },
  ];
  const keyTop = gridTop + gridH + 40;
  const keyParts: string[] = [];
  let kx = pad;
  let ky = keyTop;
  for (const item of keyItems) {
    const label = clip(item.name, 22);
    const width = 30 + Array.from(label).length * 9 + 24;
    if (kx + width > W - pad) {
      kx = pad;
      ky += 32;
    }
    keyParts.push(`<rect x="${kx}" y="${ky - 14}" width="20" height="18" rx="4" fill="${item.fill}" stroke="${item.edge}"/>`);
    keyParts.push(`<text x="${kx + 28}" y="${ky}" font-size="16" fill="#374151">${esc(label)}</text>`);
    kx += width;
  }
  const H = ky + 64;

  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  parts.push(`<text x="${pad}" y="48" font-size="30" font-weight="600" fill="#111827">${esc(labels.title)}</text>`);
  parts.push(`<text x="${pad}" y="82" font-size="18" fill="#4b5563">${esc(labels.range)} · ${esc(labels.lab)}</text>`);

  // Free hours first, so everything else draws over them.
  for (const s of free) {
    const top = y(s.from);
    const h = y(s.to) - top;
    parts.push(`<rect x="${dayX(s.day) + 1}" y="${top}" width="${dayW - 2}" height="${h}" fill="#ecfdf5"/>`);
    if (h >= 30) {
      parts.push(`<text x="${dayX(s.day) + 8}" y="${top + 20}" font-size="14" fill="#15803d">${esc(labels.free)}</text>`);
    }
  }

  // Hour lines and labels.
  for (let m = DAY_FROM; m <= DAY_TO; m += 60) {
    parts.push(`<line x1="${left}" y1="${y(m)}" x2="${W - pad}" y2="${y(m)}" stroke="#e5e7eb"/>`);
    parts.push(`<text x="${left - 10}" y="${y(m) + 5}" font-size="14" fill="#6b7280" text-anchor="end">${clock(m)}</text>`);
  }
  for (let m = DAY_FROM + 30; m < DAY_TO; m += 60) {
    parts.push(`<line x1="${left}" y1="${y(m)}" x2="${W - pad}" y2="${y(m)}" stroke="#f3f4f6"/>`);
  }

  // Day headings and the lines between days.
  labels.days.forEach((day, d) => {
    parts.push(`<text x="${dayX(d) + dayW / 2}" y="${gridTop - 18}" font-size="18" font-weight="600" fill="#111827" text-anchor="middle">${esc(day)}</text>`);
    parts.push(`<line x1="${dayX(d)}" y1="${gridTop - 8}" x2="${dayX(d)}" y2="${gridTop + gridH}" stroke="#d1d5db"/>`);
  });
  parts.push(`<line x1="${W - pad}" y1="${gridTop - 8}" x2="${W - pad}" y2="${gridTop + gridH}" stroke="#d1d5db"/>`);

  // The busy boxes, each with whose it is and when.
  for (const b of boxes) {
    const laneW = dayW / b.lanes;
    const bx = dayX(b.day) + b.lane * laneW + 2;
    const bw = laneW - 4;
    const top = y(b.from) + 1;
    const h = Math.max(6, y(b.to) - y(b.from) - 2);
    parts.push(`<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="5" fill="${b.fill}" stroke="${b.edge}"/>`);
    parts.push(`<rect x="${bx.toFixed(1)}" y="${top.toFixed(1)}" width="4" height="${h.toFixed(1)}" rx="2" fill="${b.edge}"/>`);
    // About 8px a character at this size; a box too narrow or short for a
    // line drops it rather than letting text spill over its neighbour.
    const chars = Math.floor((bw - 14) / 8);
    if (chars >= 3 && h >= 22) {
      parts.push(`<text x="${(bx + 9).toFixed(1)}" y="${(top + 18).toFixed(1)}" font-size="14" font-weight="600" fill="${b.ink}">${esc(clip(b.name, chars))}</text>`);
    }
    if (chars >= 5 && h >= 40) {
      const when = chars >= 11 ? `${clock(b.from)}–${clock(b.to)}` : clock(b.from);
      parts.push(`<text x="${(bx + 9).toFixed(1)}" y="${(top + 36).toFixed(1)}" font-size="13" fill="${b.ink}">${when}</text>`);
    }
  }
  parts.push(`<line x1="${left}" y1="${gridTop + gridH}" x2="${W - pad}" y2="${gridTop + gridH}" stroke="#d1d5db"/>`);

  parts.push(...keyParts);
  parts.push(`<text x="${pad}" y="${H - 18}" font-size="14" fill="#6b7280">${esc(labels.note)}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="IBM Plex Sans Thai">${parts.join('')}</svg>`;
}
