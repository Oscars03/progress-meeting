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

/**
 * The week as one picture: a row per person, a column per day, a bar where
 * they are busy. Above them the lab's own meetings; below them the hours
 * when everybody shown is free, which is usually what the picture is for.
 *
 * Drawn for resvg as much as for a browser, so the same SVG is the shared
 * page and the downloaded PNG: plain shapes, one font, Thai sara am split
 * beforehand (see splitSaraAm).
 */
export function renderShareSvg(input: { rows: ShareRow[]; meetings: Segment[]; labels: ShareLabels }): string {
  const { rows, meetings, labels } = input;
  const W = 1200;
  const pad = 28;
  const labelW = 190;
  const dayW = (W - pad * 2 - labelW) / 7;
  const rowH = 38;
  const top = 118;
  const allRows = [
    { name: labels.meetings, fill: '#dbeafe', edge: '#1d4ed8', busy: meetings },
    ...rows.map((r) => ({ name: r.name, fill: (AV[r.color] ?? AV.slate)[0], edge: (AV[r.color] ?? AV.slate)[1], busy: r.busy })),
    { name: labels.free, fill: '#dcfce7', edge: '#15803d', busy: freeTogether(rows.map((r) => r.busy).concat([meetings])) },
  ];
  const H = top + allRows.length * rowH + 64;
  const x = (day: number, minute: number) =>
    pad + labelW + day * dayW + ((minute - DAY_FROM) / (DAY_TO - DAY_FROM)) * dayW;

  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
  parts.push(`<text x="${pad}" y="46" font-size="26" font-weight="600" fill="#111827">${esc(labels.title)}</text>`);
  parts.push(`<text x="${pad}" y="76" font-size="17" fill="#4b5563">${esc(labels.range)} · ${esc(labels.lab)}</text>`);

  // Day headings and the lines between days, with faint marks at 12, 16 and 20.
  labels.days.forEach((day, d) => {
    const left = pad + labelW + d * dayW;
    parts.push(`<text x="${left + dayW / 2}" y="${top - 12}" font-size="15" font-weight="600" fill="#374151" text-anchor="middle">${esc(day)}</text>`);
    parts.push(`<line x1="${left}" y1="${top - 4}" x2="${left}" y2="${top + allRows.length * rowH}" stroke="#d1d5db"/>`);
    for (const hour of [12, 16, 20]) {
      const hx = x(d, hour * 60);
      parts.push(`<line x1="${hx}" y1="${top}" x2="${hx}" y2="${top + allRows.length * rowH}" stroke="#f3f4f6"/>`);
    }
  });
  parts.push(`<line x1="${W - pad}" y1="${top - 4}" x2="${W - pad}" y2="${top + allRows.length * rowH}" stroke="#d1d5db"/>`);

  allRows.forEach((row, i) => {
    const y = top + i * rowH;
    if (i % 2 === 1) parts.push(`<rect x="${pad}" y="${y}" width="${W - pad * 2}" height="${rowH}" fill="#f9fafb"/>`);
    parts.push(`<text x="${pad}" y="${y + rowH / 2 + 6}" font-size="16" fill="#111827">${esc(clip(row.name, 20))}</text>`);
    for (const s of row.busy) {
      const bx = x(s.day, s.from);
      const bw = Math.max(2, x(s.day, s.to) - bx);
      parts.push(`<rect x="${bx.toFixed(1)}" y="${y + 7}" width="${bw.toFixed(1)}" height="${rowH - 14}" rx="4" fill="${row.fill}" stroke="${row.edge}"/>`);
    }
  });
  parts.push(`<line x1="${pad}" y1="${top}" x2="${W - pad}" y2="${top}" stroke="#d1d5db"/>`);
  parts.push(`<line x1="${pad}" y1="${top + allRows.length * rowH}" x2="${W - pad}" y2="${top + allRows.length * rowH}" stroke="#d1d5db"/>`);
  parts.push(`<text x="${pad}" y="${H - 26}" font-size="14" fill="#6b7280">${esc(labels.note)}</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="IBM Plex Sans Thai">${parts.join('')}</svg>`;
}
