/**
 * The lab's weekly clips: one short clip a week, at most 5:00, posted on the
 * lab's own Facebook Page.
 *
 * Topics are a catalogue. A **series** has several **episodes**, and each
 * episode occupies one calendar week. One person is named on an episode: the
 * **maker**, who produces the clip. Never chosen by hand: it is the
 * `week_leads` lead of the working week before the episode's week -- whoever
 * hosted last week's meeting makes this week's clip, held or not. Frozen
 * (`maker_id`) when work starts, so moving the episode later does not hand
 * half-done work to somebody else. (There is no planner, draft link, notes or
 * due date: owner decision, 2026-11-12.)
 *
 * Nothing here reads or writes the sheet. Pages compute from what they read,
 * and only a person pressing a button writes -- see clips/actions.ts.
 */

import type { ClipRecord, ClipSeriesRecord, TermBreakRecord, UserRecord, WeekLeadRecord } from './db/schema';
import { breakForWeek } from './term-breaks';
import { leadForWeek, planWeekLeads } from './rotation';
import { isMember } from './members';
import { nextWeekKey, previousWeekKey, weekKey, weekStartDate } from './week';
import { EVENT_COLORS, isEventColor, type EventColor } from './event-colors';
import { LAB_UTC_OFFSET } from './lab-time';

/** The 4 stages, in order, plus `skipped` beside them. */
export const CLIP_STAGES = ['planned', 'in_production', 'ready', 'published'] as const;
export const CLIP_STATUSES = [...CLIP_STAGES, 'skipped'] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

export function isClipStatus(value: unknown): value is ClipStatus {
  return (CLIP_STATUSES as readonly unknown[]).includes(value);
}

/** A row's status, with anything unrecognised read as the first stage. */
export function statusOf(clip: Pick<ClipRecord, 'status'>): ClipStatus {
  return isClipStatus(clip.status) ? clip.status : 'planned';
}

export const SERIES_STATUSES = ['active', 'finished', 'archived'] as const;
export type SeriesStatus = (typeof SERIES_STATUSES)[number];

export function isSeriesStatus(value: unknown): value is SeriesStatus {
  return (SERIES_STATUSES as readonly unknown[]).includes(value);
}

/** The hard cap on a clip's length, in seconds. */
export const MAX_DURATION_SEC = 300;
/** How many working weeks ahead an episode may be booked, this week included. */
export const BOOKING_HORIZON = 13;
/** How long the "moved" notice stays on an episode. */
export const MOVE_NOTICE_DAYS = 14;
/** How many episodes a new series may be created with in one go. */
export const MAX_EPISODES_AT_ONCE = 20;

export const LIMITS = {
  seriesTitle: 120,
  seriesDescription: 2000,
  episodeTitle: 200,
  episodeDetails: 2000,
} as const;

/* ------------------------------------------------------------------ */
/* Duration                                                            */
/* ------------------------------------------------------------------ */

/**
 * Seconds from what somebody typed: "4:30", "04:30" or plain seconds "270".
 * Null when it is not a time at all. Range is not checked here.
 */
export function parseDuration(text: unknown): number | null {
  if (typeof text === 'number') return Number.isInteger(text) ? text : null;
  if (typeof text !== 'string') return null;
  const value = text.trim();
  const clock = value.match(/^(\d{1,2}):([0-5]\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  if (/^\d{1,4}$/.test(value)) return Number(value);
  return null;
}

/** Whether a number of seconds is a length a clip may have. */
export function isAllowedDuration(sec: number): boolean {
  return Number.isInteger(sec) && sec >= 1 && sec <= MAX_DURATION_SEC;
}

/** 270 -> "4:30". */
export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The stored duration as a number, or null when none is recorded. */
export function durationOf(clip: Pick<ClipRecord, 'duration_sec'>): number | null {
  const n = Number(clip.duration_sec);
  return clip.duration_sec === '' || !Number.isFinite(n) ? null : n;
}

/* ------------------------------------------------------------------ */
/* Who makes it                                                        */
/* ------------------------------------------------------------------ */

export type ClipMaker =
  /** Frozen when work started. */
  | { kind: 'pinned'; userId: string }
  /** The confirmed lead of `hostWeek`, the working week before. */
  | { kind: 'rotation'; userId: string; hostWeek: string; afterBreak: boolean }
  /** Where the rotation lands for `hostWeek`, not confirmed yet. */
  | { kind: 'projected'; userId: string; hostWeek: string; afterBreak: boolean }
  | { kind: 'none'; reason: 'unscheduled' }
  | { kind: 'none'; reason: 'breakWeek' }
  | { kind: 'none'; reason: 'noHost'; hostWeek: string }
  | { kind: 'none'; reason: 'hostDeleted'; hostWeek: string }
  | { kind: 'none'; reason: 'hostLeft'; hostWeek: string; userId: string };

/** The id of whoever makes it, when anybody does. */
export function makerId(maker: ClipMaker): string | null {
  return maker.kind === 'none' ? null : maker.userId;
}

/** How far back a host week is looked for past break weeks -- two years. */
const MAX_BREAK_WEEKS = 104;

/**
 * Who makes the clip for an episode, or a week.
 *
 * The frozen maker if there is one. Otherwise the lead recorded for the
 * nearest working week before the episode's week; a week that had a lead and
 * no meeting still counts. A week ahead whose lead is not confirmed yet gets
 * the person the rotation lands on, marked as projected.
 *
 * No fallback when the host has left the lab or nobody was recorded: guessing
 * would put a name on screen with false confidence. The page says so, and the
 * owner settles it outside the app (or an admin corrects week_leads).
 */
export function clipMaker(
  clip: Pick<ClipRecord, 'week_key'> & Partial<Pick<ClipRecord, 'maker_id'>>,
  leads: WeekLeadRecord[],
  users: UserRecord[],
  breaks: TermBreakRecord[],
  today: string = weekKey()
): ClipMaker {
  if (clip.maker_id) return { kind: 'pinned', userId: clip.maker_id };

  const week = clip.week_key;
  if (!week) return { kind: 'none', reason: 'unscheduled' };
  if (breakForWeek(breaks, week)) return { kind: 'none', reason: 'breakWeek' };

  let host = previousWeekKey(week);
  let skipped = 0;
  while (breakForWeek(breaks, host) && skipped < MAX_BREAK_WEEKS) {
    host = previousWeekKey(host);
    skipped++;
  }
  const afterBreak = skipped > 0;

  const lead = leadForWeek(leads, host);
  if (!lead) {
    if (host >= today) {
      const planned = planWeekLeads(users, leads, breaks, host, 1)[0];
      if (planned?.user_id) {
        return { kind: 'projected', userId: planned.user_id, hostWeek: host, afterBreak };
      }
    }
    return { kind: 'none', reason: 'noHost', hostWeek: host };
  }

  const user = users.find((u) => u.id === lead.user_id);
  if (!user) return { kind: 'none', reason: 'hostDeleted', hostWeek: host };
  if (!isMember(user)) return { kind: 'none', reason: 'hostLeft', hostWeek: host, userId: user.id };
  return { kind: 'rotation', userId: user.id, hostWeek: host, afterBreak };
}

/* ------------------------------------------------------------------ */
/* Weeks                                                               */
/* ------------------------------------------------------------------ */

/**
 * The working weeks an episode may be booked into, in order: this week and
 * on, skipping breaks, `horizon` of them.
 */
export function bookableWeeks(
  breaks: TermBreakRecord[],
  today: string = weekKey(),
  horizon: number = BOOKING_HORIZON
): string[] {
  const out: string[] = [];
  let key = today;
  // Bounded: a sheet full of breaks must not spin forever.
  for (let i = 0; out.length < horizon && i < horizon + MAX_BREAK_WEEKS; i++) {
    if (!breakForWeek(breaks, key)) out.push(key);
    key = nextWeekKey(key);
  }
  return out;
}

export type WeekProblem = 'badWeek' | 'breakWeek' | 'pastWeek' | 'beyondHorizon' | 'weekTaken';

/**
 * Why an episode cannot go into `week`, or null when it can. `selfId` is the
 * episode being placed, which does not clash with itself.
 */
export function weekProblem(
  week: string,
  clips: Pick<ClipRecord, 'id' | 'week_key'>[],
  breaks: TermBreakRecord[],
  selfId: string | null,
  today: string = weekKey(),
  horizon: number = BOOKING_HORIZON
): WeekProblem | null {
  if (!weekStartDate(week)) return 'badWeek';
  if (week < today) return 'pastWeek';
  if (breakForWeek(breaks, week)) return 'breakWeek';
  const allowed = bookableWeeks(breaks, today, horizon);
  if (!allowed.includes(week)) return 'beyondHorizon';
  if (clips.some((c) => c.id !== selfId && c.week_key === week)) return 'weekTaken';
  return null;
}

/**
 * Where an episode's next free week search starts: this week, or the week
 * after the latest week booked by an earlier episode of the same series, so a
 * series stays in order.
 */
export function seriesStartWeek(
  clips: Pick<ClipRecord, 'id' | 'series_id' | 'episode_no' | 'week_key'>[],
  episode: Pick<ClipRecord, 'id' | 'series_id' | 'episode_no'>,
  today: string = weekKey()
): string {
  const no = Number(episode.episode_no);
  let latest = '';
  for (const c of clips) {
    if (c.id === episode.id || c.series_id !== episode.series_id || !c.week_key) continue;
    if (Number(c.episode_no) < no && c.week_key > latest) latest = c.week_key;
  }
  if (!latest) return today;
  const after = nextWeekKey(latest);
  return after > today ? after : today;
}

/**
 * The first free working week at or after `from`, within the horizon counted
 * from this week. Null when every one of them is taken.
 */
export function nextFreeWeek(
  clips: Pick<ClipRecord, 'id' | 'week_key'>[],
  breaks: TermBreakRecord[],
  from: string,
  today: string = weekKey(),
  horizon: number = BOOKING_HORIZON
): string | null {
  const taken = new Set(clips.map((c) => c.week_key).filter(Boolean));
  for (const key of bookableWeeks(breaks, today, horizon)) {
    if (key >= from && !taken.has(key)) return key;
  }
  return null;
}

/**
 * The episode that holds a week. Normally the only one; if two ever claim it
 * (a race between two servers), the one booked first.
 */
export function canonicalForWeek<T extends Pick<ClipRecord, 'id' | 'week_key' | 'scheduled_at'>>(
  clips: T[],
  week: string
): T | null {
  const inWeek = clips.filter((c) => c.week_key === week);
  if (inWeek.length === 0) return null;
  return [...inWeek].sort(
    (a, b) =>
      (a.scheduled_at || '￿').localeCompare(b.scheduled_at || '￿') || a.id.localeCompare(b.id)
  )[0];
}

/** Ids of every episode that shares its week with another. */
export function clashingIds(clips: Pick<ClipRecord, 'id' | 'week_key'>[]): Set<string> {
  const byWeek = new Map<string, string[]>();
  for (const c of clips) {
    if (!c.week_key) continue;
    byWeek.set(c.week_key, [...(byWeek.get(c.week_key) ?? []), c.id]);
  }
  const out = new Set<string>();
  for (const ids of byWeek.values()) if (ids.length > 1) ids.forEach((id) => out.add(id));
  return out;
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/** A YYYY-MM-DD as noon that day in the lab, ISO; null if not a date. */
export function noonOfLabDay(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const at = new Date(`${date}T12:00:00${LAB_UTC_OFFSET}`);
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

/** Whether the "moved" notice should still show. */
export function moveNoticeActive(clip: Pick<ClipRecord, 'moved_at'>, now: Date = new Date()): boolean {
  if (!clip.moved_at) return false;
  const at = Date.parse(clip.moved_at);
  return Number.isFinite(at) && now.getTime() - at < MOVE_NOTICE_DAYS * 86400000;
}

/* ------------------------------------------------------------------ */
/* Stages                                                              */
/* ------------------------------------------------------------------ */

/**
 * What stands between an episode and `to`, or null when nothing does.
 * Published is reached through the publish form, which checks its own fields.
 *
 * Moves are one stage at a time. Stepping back out of `published` and anything
 * to do with `skipped` is admin's.
 */
export type TransitionProblem =
  | 'notOneStep'
  | 'adminOnly'
  | 'needsWeek'
  | 'durationRequired'
  | 'usePublishForm';

export function transitionProblem(
  clip: Pick<ClipRecord, 'status' | 'week_key' | 'duration_sec'>,
  to: ClipStatus,
  isAdmin: boolean
): TransitionProblem | null {
  const from = statusOf(clip);
  if (from === to) return 'notOneStep';

  if (to === 'skipped' || from === 'skipped') {
    if (!isAdmin) return 'adminOnly';
    if (from === 'skipped' && to !== 'planned') return 'notOneStep';
    if (to === 'skipped' && from === 'published') return 'notOneStep';
    return null;
  }

  const a = CLIP_STAGES.indexOf(from);
  const b = CLIP_STAGES.indexOf(to);
  if (Math.abs(a - b) !== 1) return 'notOneStep';

  if (b < a) return from === 'published' && !isAdmin ? 'adminOnly' : null;

  if (to === 'in_production' && !clip.week_key) return 'needsWeek';
  if (to === 'ready') {
    const d = durationOf(clip);
    if (d === null || !isAllowedDuration(d)) return 'durationRequired';
  }
  if (to === 'published') return 'usePublishForm';
  return null;
}

/* ------------------------------------------------------------------ */
/* Series                                                              */
/* ------------------------------------------------------------------ */

export type SeriesSummary = {
  episodes: number;
  published: number;
  /** In production or ready. */
  inProgress: number;
  /** Planned with a week. */
  planned: number;
  /** No week yet. */
  queued: number;
  /** The first episode, by week, from this week on that is not published or skipped. */
  next: ClipRecord | null;
};

/** Counts for a series card, worked out from the episodes so they never drift. */
export function seriesSummary(
  seriesId: string,
  clips: ClipRecord[],
  today: string = weekKey()
): SeriesSummary {
  const mine = clips.filter((c) => c.series_id === seriesId);
  const summary: SeriesSummary = { episodes: mine.length, published: 0, inProgress: 0, planned: 0, queued: 0, next: null };
  for (const c of mine) {
    const status = statusOf(c);
    if (status === 'published') summary.published++;
    else if (status === 'in_production' || status === 'ready') summary.inProgress++;
    if (!c.week_key && status !== 'published' && status !== 'skipped') summary.queued++;
    else if (status === 'planned') summary.planned++;
  }
  summary.next =
    mine
      .filter((c) => c.week_key && c.week_key >= today && !['published', 'skipped'].includes(statusOf(c)))
      .sort((a, b) => a.week_key.localeCompare(b.week_key))[0] ?? null;
  return summary;
}

/** A series' episodes in their order. */
export function episodesOf(seriesId: string, clips: ClipRecord[]): ClipRecord[] {
  return clips
    .filter((c) => c.series_id === seriesId)
    .sort((a, b) => Number(a.episode_no) - Number(b.episode_no) || a.created_at.localeCompare(b.created_at));
}

/** The next episode number in a series. */
export function nextEpisodeNo(seriesId: string, clips: Pick<ClipRecord, 'series_id' | 'episode_no'>[]): number {
  let max = 0;
  for (const c of clips) {
    if (c.series_id !== seriesId) continue;
    const n = Number(c.episode_no);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/** The series' colour: the one stored, or one picked from its id. */
export function seriesColor(series: Pick<ClipSeriesRecord, 'id' | 'color'>): EventColor {
  if (isEventColor(series.color)) return series.color;
  let h = 0;
  for (const ch of series.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return EVENT_COLORS[h % EVENT_COLORS.length];
}

/** The order cards go in: next booked week first, then nothing booked, then finished. */
export function catalogueOrder(
  series: ClipSeriesRecord[],
  clips: ClipRecord[],
  today: string = weekKey()
): ClipSeriesRecord[] {
  const rank = (s: ClipSeriesRecord) => {
    if (s.status !== 'active') return `2|${s.title}`;
    const next = seriesSummary(s.id, clips, today).next;
    return next ? `0|${next.week_key}` : `1|${s.created_at}`;
  };
  return [...series].sort((a, b) => rank(a).localeCompare(rank(b)));
}
