'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo, ConflictError } from '@/lib/db/sheet-repo';
import { requireRole, requireSession, type SessionUser } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import type {
  ClipRecord,
  ClipSeriesRecord,
  TermBreakRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';
import { isEventColor } from '@/lib/event-colors';
import { isMember } from '@/lib/members';
import { isLabFacebookUrl, safeHttpsUrl } from '@/lib/safe-url';
import { isRealWeekKey, weekKey } from '@/lib/week';
import {
  LIMITS,
  MAX_EPISODES_AT_ONCE,
  clipMaker,
  endOfLabDay,
  isAllowedDuration,
  isClipStatus,
  isSeriesStatus,
  makerId,
  nextEpisodeNo,
  nextFreeWeek,
  noonOfLabDay,
  parseDuration,
  seriesStartWeek,
  statusOf,
  transitionProblem,
  weekProblem,
  formatDuration,
  MAX_DURATION_SEC,
} from '@/lib/clips';

/*
 * Everybody signed in manages clip content: creating series, adding
 * episodes, booking and moving weeks, recording the planner, moving work along
 * (owner, D3/D16/D20/D22). So most actions only ask for a session, plus the
 * data rules. What stays admin's is destructive or changes a record of what
 * happened: deleting a series, anything about a published episode, skipping.
 *
 * Every read that a decision rests on is fresh, and every write carries the
 * row_version the page read, so a stale screen is refused, not obeyed.
 */

const isAdmin = (actor: SessionUser) => actor.role === 'admin';

function revalidateClips(): void {
  revalidatePath('/clips', 'layout');
}

function text(value: unknown, max: number, key: 'clips.error.titleTooLong' | 'clips.error.textTooLong'): string {
  const out = typeof value === 'string' ? value.trim() : '';
  if (out.length > max) throw new UserError(key, { n: max });
  return out;
}

function requiredTitle(value: unknown, max: number): string {
  const out = text(value, max, 'clips.error.titleTooLong');
  if (!out) throw new UserError('clips.error.titleRequired');
  return out;
}

function version(value: unknown): number {
  // Left to the repository to refuse; this only stops a string sneaking past.
  return typeof value === 'number' ? value : Number.NaN;
}

async function freshClip(id: string): Promise<{ clip: ClipRecord; clips: ClipRecord[] }> {
  const clips = await SheetRepo.find<ClipRecord>('clips', { fresh: true });
  const clip = clips.find((c) => c.id === id);
  if (!clip) throw new UserError('error.notFound');
  return { clip, clips };
}

/** A published episode is a record of what was posted: admin's to change. */
function assertNotPublished(actor: SessionUser, clip: ClipRecord): void {
  if (statusOf(clip) === 'published' && !isAdmin(actor)) throw new UserError('clips.error.publishedLocked');
}

/** An active member's id, or a refusal. */
async function memberId(id: unknown): Promise<string> {
  if (typeof id !== 'string' || !id) throw new UserError('clips.error.notMember');
  const users = await SheetRepo.find<UserRecord>('users');
  const user = users.find((u) => u.id === id);
  if (!user || !isMember(user)) throw new UserError('clips.error.notMember');
  return user.id;
}

/* ------------------------------------------------------------------ */
/* Series                                                              */
/* ------------------------------------------------------------------ */

type SeriesInput = { title: string; description?: string; color?: string };

function cleanSeries(data: SeriesInput) {
  const color = typeof data.color === 'string' ? data.color : '';
  if (color && !isEventColor(color)) throw new UserError('error.invalidValue', { value: color });
  return {
    title: requiredTitle(data.title, LIMITS.seriesTitle),
    description: text(data.description, LIMITS.seriesDescription, 'clips.error.textTooLong'),
    color,
  };
}

/**
 * Add an episode at the end of a series, waiting in its queue.
 *
 * The number is the series' highest plus one. Two people adding at the same
 * moment would pick the same number, so the insert is unique on
 * (series, number) and tries the next one when it finds it taken.
 */
async function appendEpisode(
  actor: SessionUser,
  seriesId: string,
  data: { title: string; details?: string }
): Promise<ClipRecord> {
  const title = requiredTitle(data.title, LIMITS.episodeTitle);
  const details = text(data.details, LIMITS.episodeDetails, 'clips.error.textTooLong');

  for (let attempt = 0; attempt < 3; attempt++) {
    const clips = await SheetRepo.find<ClipRecord>('clips', { fresh: true });
    const no = nextEpisodeNo(seriesId, clips);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const row = await SheetRepo.insert(
      'clips',
      {
        id,
        series_id: seriesId,
        episode_no: no,
        week_key: '',
        scheduled_at: '',
        title,
        details,
        maker_id: '',
        status: 'planned',
        status_at: now,
        due_at: '',
        duration_sec: '',
        draft_url: '',
        notes: '',
        published_url: '',
        published_at: '',
        published_by: '',
        moved_from: '',
        moved_by: '',
        moved_at: '',
        planner_id: '',
        planner_set_by: '',
        planner_set_at: '',
      },
      actor.id,
      { uniqueBy: { series_id: seriesId, episode_no: no } }
    );
    if (row.id === id) return row as unknown as ClipRecord;
  }
  throw new ConflictError(`Could not number a new episode of ${seriesId}`);
}

/** Start a topic with several episodes. Anybody may (D3). */
export async function createSeriesAction(data: SeriesInput & { episodes?: string[] }): Promise<
  ActionResult<{ seriesId: string; added: number }>
> {
  return toResult(async () => {
    const actor = await requireSession();
    const series = cleanSeries(data);
    const titles = (Array.isArray(data.episodes) ? data.episodes : [])
      .map((t) => (typeof t === 'string' ? t.trim() : ''))
      .filter(Boolean);
    if (titles.length > MAX_EPISODES_AT_ONCE) {
      throw new UserError('clips.error.tooManyEpisodes', { n: MAX_EPISODES_AT_ONCE });
    }
    titles.forEach((t) => requiredTitle(t, LIMITS.episodeTitle));

    const row = await SheetRepo.insert('clip_series', { ...series, status: 'active' }, actor.id);

    // One insert each. If one fails the series keeps the ones that landed,
    // which is visible and harmless.
    let added = 0;
    for (const title of titles) {
      await appendEpisode(actor, row.id, { title });
      added++;
    }

    revalidateClips();
    return { seriesId: row.id, added };
  });
}

/**
 * A one-off topic: a series of one, in one step (D18). It can be booked
 * straight away into the next free week or a chosen one, or left queued. A
 * booking that fails leaves the episode queued and says why.
 */
export async function createOneOffAction(data: {
  title: string;
  details?: string;
  color?: string;
  /** '' to leave it queued, 'next' for the next free week, or a week key. */
  week?: string;
}): Promise<ActionResult<{ seriesId: string; clipId: string; bookError?: string }>> {
  return toResult(async () => {
    const actor = await requireSession();
    const series = cleanSeries({ title: data.title, color: data.color });
    const details = text(data.details, LIMITS.episodeDetails, 'clips.error.textTooLong');
    const target = data.week ?? '';
    if (target && target !== 'next' && !isRealWeekKey(target)) {
      throw new UserError('clips.error.badWeek');
    }

    const row = await SheetRepo.insert('clip_series', { ...series, status: 'active' }, actor.id);
    const clip = await appendEpisode(actor, row.id, { title: series.title, details });

    let bookError: string | undefined;
    if (target) {
      try {
        await placeInWeek(actor, clip.id, clip.row_version, target, 'book');
      } catch (err) {
        if (!(err instanceof UserError)) throw err;
        bookError = err.key as string;
      }
    }

    revalidateClips();
    return { seriesId: row.id, clipId: clip.id, ...(bookError ? { bookError } : {}) };
  });
}

/** Reword a series, change its colour or mark it finished. Anybody (D22). */
export async function updateSeriesAction(
  id: string,
  data: SeriesInput & { status?: string },
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    const fields: Record<string, string> = cleanSeries(data);
    if (data.status !== undefined) {
      if (!isSeriesStatus(data.status)) throw new UserError('error.invalidValue', { value: String(data.status) });
      fields.status = data.status;
    }
    await SheetRepo.update<ClipSeriesRecord>('clip_series', id, fields, version(rowVersion), actor.id);
    revalidateClips();
  });
}

/**
 * Delete a series and every episode in it. Admin only: it removes other
 * people's work, published records included. audit_log keeps every row.
 */
export async function deleteSeriesAction(id: string, rowVersion: number): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('admin');
    const clips = await SheetRepo.find<ClipRecord>('clips', { fresh: true });
    const mine = clips.filter((c) => c.series_id === id);
    // Episodes first: a series that failed to go is still visible and can be
    // deleted again; episodes pointing at nothing would be lost from view.
    await SheetRepo.deleteMany(
      'clips',
      mine.map((c) => ({ id: c.id, expectedVersion: c.row_version })),
      actor.id
    );
    await SheetRepo.delete('clip_series', id, version(rowVersion), actor.id);
    revalidateClips();
  });
}

/* ------------------------------------------------------------------ */
/* Episodes                                                            */
/* ------------------------------------------------------------------ */

/** Add an episode to any series, at the end of its queue (D17). */
export async function addEpisodeAction(
  seriesId: string,
  data: { title: string; details?: string }
): Promise<ActionResult<{ clipId: string }>> {
  return toResult(async () => {
    const actor = await requireSession();
    const series = await SheetRepo.findOne<ClipSeriesRecord>('clip_series', seriesId);
    if (!series) throw new UserError('error.notFound');
    const clip = await appendEpisode(actor, series.id, data);
    revalidateClips();
    return { clipId: clip.id };
  });
}

/**
 * Reword an episode. Locked for everyone but admin once its week is over --
 * the topic of a past week is a record -- and once it is published.
 */
export async function updateEpisodeAction(
  id: string,
  data: { title: string; details?: string },
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    const { clip } = await freshClip(id);
    assertNotPublished(actor, clip);
    if (!isAdmin(actor) && clip.week_key && clip.week_key < weekKey()) {
      throw new UserError('clips.error.pastWeekLocked');
    }
    await SheetRepo.update<ClipRecord>(
      'clips',
      id,
      {
        title: requiredTitle(data.title, LIMITS.episodeTitle),
        details: text(data.details, LIMITS.episodeDetails, 'clips.error.textTooLong'),
      },
      version(rowVersion),
      actor.id
    );
    revalidateClips();
  });
}

/**
 * Remove an episode. A planned one: whoever added it, whoever looks after the
 * series, or admin. Anything further along is a record of work done, and is
 * admin's.
 */
export async function deleteEpisodeAction(id: string, rowVersion: number): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    const { clip } = await freshClip(id);
    if (!isAdmin(actor)) {
      if (statusOf(clip) !== 'planned') throw new UserError('clips.error.deleteAdminOnly');
      const series = await SheetRepo.findOne<ClipSeriesRecord>('clip_series', clip.series_id);
      if (clip.created_by !== actor.id && series?.created_by !== actor.id) {
        throw new UserError('error.forbidden');
      }
    }
    await SheetRepo.delete('clips', id, version(rowVersion), actor.id);
    revalidateClips();
  });
}

/* ------------------------------------------------------------------ */
/* Weeks                                                               */
/* ------------------------------------------------------------------ */

const WEEK_ERROR = {
  badWeek: 'clips.error.badWeek',
  breakWeek: 'clips.error.breakWeek',
  pastWeek: 'clips.error.pastWeek',
  beyondHorizon: 'clips.error.beyondHorizon',
  weekTaken: 'clips.error.weekTaken',
} as const;

/**
 * Put an episode into a week: `book` one waiting in the queue, or `move` one
 * that already has a week. Free weeks only -- this never pushes another
 * episode out. The uniqueness check inside the write catches two people
 * taking one week at once; with 'next' it then tries the following free week.
 */
async function placeInWeek(
  actor: SessionUser,
  id: string,
  rowVersion: number,
  target: string,
  mode: 'book' | 'move'
): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const [{ clip, clips }, breaks] = await Promise.all([
      freshClip(id),
      SheetRepo.find<TermBreakRecord>('term_breaks'),
    ]);
    assertNotPublished(actor, clip);
    if (statusOf(clip) === 'skipped' && !isAdmin(actor)) throw new UserError('clips.error.skippedLocked');
    if (mode === 'book' && clip.week_key) throw new UserError('clips.error.alreadyBooked');
    if (mode === 'move' && !clip.week_key) throw new UserError('clips.error.notBooked');

    const today = weekKey();
    let week: string;
    if (target === 'next') {
      const found = nextFreeWeek(clips, breaks, seriesStartWeek(clips, clip, today), today);
      if (!found) throw new UserError('clips.error.noFreeWeek');
      week = found;
    } else {
      if (!isRealWeekKey(target)) throw new UserError('clips.error.badWeek');
      if (target === clip.week_key) throw new UserError('clips.error.sameWeek');
      const problem = weekProblem(target, clips, breaks, clip.id, today);
      if (problem) throw new UserError(WEEK_ERROR[problem]);
      week = target;
    }

    const now = new Date().toISOString();
    const fields: Record<string, string> = { week_key: week, scheduled_at: now };
    if (mode === 'move') {
      // The due date follows the week; a pinned maker stays (it is on the row).
      Object.assign(fields, { moved_from: clip.week_key, moved_by: actor.id, moved_at: now, due_at: '' });
    }

    try {
      await SheetRepo.update<ClipRecord>('clips', id, fields, version(rowVersion), actor.id, {
        uniqueBy: { week_key: week },
      });
      return week;
    } catch (err) {
      if (!(err instanceof ConflictError)) throw err;
      // Either the row changed (stale screen) or another episode took the
      // week a moment ago. Only the second is worth a retry.
      const again = await SheetRepo.find<ClipRecord>('clips', { fresh: true });
      const self = again.find((c) => c.id === id);
      const taken = again.some((c) => c.id !== id && c.week_key === week);
      if (!taken || self?.row_version !== rowVersion) throw err;
      if (target !== 'next') throw new UserError('clips.error.weekTaken');
    }
  }
  throw new UserError('clips.error.weekTaken');
}

/** Book a queued episode into the next free week, or a chosen one. Anybody. */
export async function bookEpisodeAction(
  id: string,
  rowVersion: number,
  week: string
): Promise<ActionResult<{ week: string }>> {
  return toResult(async () => {
    const actor = await requireSession();
    const placed = await placeInWeek(actor, id, rowVersion, week, 'book');
    revalidateClips();
    return { week: placed };
  });
}

/**
 * Move a booked episode to another free week. Anybody, even mid-production
 * (D20): the pinned maker stays with the work, and the move is written on the
 * row (`moved_*`) and in audit_log so the maker can see it.
 */
export async function moveEpisodeAction(
  id: string,
  rowVersion: number,
  week: string
): Promise<ActionResult<{ week: string }>> {
  return toResult(async () => {
    const actor = await requireSession();
    const placed = await placeInWeek(actor, id, rowVersion, week, 'move');
    revalidateClips();
    return { week: placed };
  });
}

/** Take an episode out of its week, back into the queue. Not a published one. */
export async function unbookEpisodeAction(id: string, rowVersion: number): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    const { clip } = await freshClip(id);
    assertNotPublished(actor, clip);
    if (!clip.week_key) throw new UserError('clips.error.notBooked');
    const now = new Date().toISOString();
    await SheetRepo.update<ClipRecord>(
      'clips',
      id,
      { week_key: '', scheduled_at: '', moved_from: clip.week_key, moved_by: actor.id, moved_at: now, due_at: '' },
      version(rowVersion),
      actor.id
    );
    revalidateClips();
  });
}

/* ------------------------------------------------------------------ */
/* People and work                                                     */
/* ------------------------------------------------------------------ */

/**
 * Record who plans the episode's content (D25). Anybody may, to any active
 * member; clearing it is only allowed while nothing has started. The answer
 * says when the planner is also the maker -- a warning, never a refusal (D27).
 */
export async function setPlannerAction(
  id: string,
  plannerId: string,
  rowVersion: number
): Promise<ActionResult<{ sameAsMaker: boolean }>> {
  return toResult(async () => {
    const actor = await requireSession();
    const { clip } = await freshClip(id);
    assertNotPublished(actor, clip);

    let planner = '';
    if (plannerId) planner = await memberId(plannerId);
    else if (statusOf(clip) !== 'planned') throw new UserError('clips.error.plannerClearLocked');

    await SheetRepo.update<ClipRecord>(
      'clips',
      id,
      { planner_id: planner, planner_set_by: actor.id, planner_set_at: new Date().toISOString() },
      version(rowVersion),
      actor.id
    );

    const [leads, users, breaks] = await Promise.all([
      SheetRepo.find<WeekLeadRecord>('week_leads'),
      SheetRepo.find<UserRecord>('users'),
      SheetRepo.find<TermBreakRecord>('term_breaks'),
    ]);
    const maker = makerId(clipMaker(clip, leads, users, breaks));
    revalidateClips();
    return { sameAsMaker: Boolean(planner && maker === planner) };
  });
}

const TRANSITION_ERROR = {
  notOneStep: 'clips.error.notOneStep',
  adminOnly: 'clips.error.statusAdminOnly',
  needsWeek: 'clips.error.needsWeek',
  plannerRequired: 'clips.error.plannerRequired',
  durationRequired: 'clips.error.durationRequired',
  usePublishForm: 'clips.error.usePublishForm',
} as const;

/**
 * Move an episode one stage forward or back. Anybody (the maker is the one
 * expected to, but anyone may help).
 *
 * Leaving `planned` freezes the maker -- the derived one, never a choice -- so
 * moving the episode later keeps the work with whoever started it. Going back
 * to `planned` lets it follow the week again.
 */
export async function setEpisodeStatusAction(
  id: string,
  to: string,
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    if (!isClipStatus(to)) throw new UserError('error.invalidValue', { value: String(to) });
    const { clip } = await freshClip(id);

    const problem = transitionProblem(clip, to, isAdmin(actor));
    if (problem) throw new UserError(TRANSITION_ERROR[problem]);

    const fields: Record<string, string> = { status: to, status_at: new Date().toISOString() };
    const from = statusOf(clip);
    if (from === 'planned' && to === 'in_production' && !clip.maker_id) {
      const [leads, users, breaks] = await Promise.all([
        SheetRepo.find<WeekLeadRecord>('week_leads', { fresh: true }),
        SheetRepo.find<UserRecord>('users'),
        SheetRepo.find<TermBreakRecord>('term_breaks'),
      ]);
      const maker = clipMaker(clip, leads, users, breaks);
      // Only a confirmed lead is frozen. A projected one may still change, and
      // with nobody to freeze the episode keeps following its week (D28).
      if (maker.kind === 'rotation') fields.maker_id = maker.userId;
    }
    if (to === 'planned') fields.maker_id = '';

    await SheetRepo.update<ClipRecord>('clips', id, fields, version(rowVersion), actor.id);
    revalidateClips();
  });
}

/**
 * The working details: length, draft link, notes, due date. Anybody.
 *
 * The 5:00 cap is checked here on every write -- a server action is a public
 * endpoint, so the form's own check decides nothing.
 */
export async function updateEpisodeWorkAction(
  id: string,
  data: { duration?: string; draftUrl?: string; notes?: string; dueDate?: string },
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    const { clip } = await freshClip(id);
    assertNotPublished(actor, clip);

    const fields: Record<string, string | number> = {};

    if (data.duration !== undefined) {
      const raw = data.duration.trim();
      if (!raw) {
        // Ready and later need a length; it cannot be taken away from them.
        if (['ready', 'published'].includes(statusOf(clip))) throw new UserError('clips.error.durationRequired');
        fields.duration_sec = '';
      } else {
        const sec = parseDuration(raw);
        if (sec === null) throw new UserError('clips.error.durationInvalid');
        if (sec > MAX_DURATION_SEC) {
          throw new UserError('clips.error.tooLong', { length: formatDuration(sec) });
        }
        if (!isAllowedDuration(sec)) throw new UserError('clips.error.durationInvalid');
        fields.duration_sec = sec;
      }
    }

    if (data.draftUrl !== undefined) {
      const raw = data.draftUrl.trim();
      if (raw) {
        const safe = safeHttpsUrl(raw);
        if (!safe) throw new UserError('clips.error.badUrl');
        fields.draft_url = safe;
      } else fields.draft_url = '';
    }

    if (data.notes !== undefined) fields.notes = text(data.notes, LIMITS.notes, 'clips.error.textTooLong');

    if (data.dueDate !== undefined) {
      const raw = data.dueDate.trim();
      if (raw) {
        const due = endOfLabDay(raw);
        if (!due) throw new UserError('error.dateInvalid');
        fields.due_at = due;
      } else fields.due_at = '';
    }

    await SheetRepo.update<ClipRecord>('clips', id, fields, version(rowVersion), actor.id);
    revalidateClips();
  });
}

/**
 * Record the post on the lab's Facebook Page, which publishes the episode.
 * Anybody, from `ready` (D14). Changing the record once published is admin's.
 */
export async function publishEpisodeAction(
  id: string,
  data: { url: string; date: string; postedBy: string },
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    const { clip } = await freshClip(id);
    const status = statusOf(clip);
    assertNotPublished(actor, clip);
    if (status !== 'ready' && status !== 'published') throw new UserError('clips.error.notReady');

    if (!isLabFacebookUrl(data.url)) throw new UserError('clips.error.notFacebook');
    const at = noonOfLabDay(String(data.date ?? '').trim());
    if (!at) throw new UserError('error.dateInvalid');
    const postedBy = await memberId(data.postedBy);

    const fields: Record<string, string> = {
      published_url: safeHttpsUrl(data.url)!,
      published_at: at,
      published_by: postedBy,
    };
    if (status !== 'published') Object.assign(fields, { status: 'published', status_at: new Date().toISOString() });

    await SheetRepo.update<ClipRecord>('clips', id, fields, version(rowVersion), actor.id);
    revalidateClips();
  });
}
