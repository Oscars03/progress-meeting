/**
 * The weekly clips' rules, as pure functions: who makes an episode's clip,
 * which weeks it may go into, which stage changes are allowed, the 5:00 cap
 * and the link checks. See lib/clips.ts and lib/safe-url.ts.
 *
 * "Today" is passed in everywhere, so nothing here depends on the date the
 * tests run.
 */

import { describe, it, expect } from 'vitest';
import type { ClipRecord, TermBreakRecord, UserRecord, WeekLeadRecord } from '../lib/db/schema';
import {
  bookableWeeks,
  canonicalForWeek,
  clashingIds,
  clipMaker,
  dueAt,
  formatDuration,
  isAllowedDuration,
  isLate,
  moveNoticeActive,
  nextEpisodeNo,
  nextFreeWeek,
  parseDuration,
  seriesColor,
  seriesStartWeek,
  seriesSummary,
  transitionProblem,
  weekProblem,
} from '../lib/clips';
import { isLabFacebookUrl, safeHttpsUrl } from '../lib/safe-url';

const TODAY = '2026-W46';

function user(id: string, extra: Partial<UserRecord> = {}): UserRecord {
  return {
    id,
    name: id.toUpperCase(),
    email: `${id}@lab`,
    password_hash: '',
    role: 'student',
    team_id: '',
    line_id: '',
    active: true,
    rotation_order: '',
    permissions: '',
    created_at: '2026-01-01',
    updated_at: '',
    row_version: 1,
    created_by: '',
    ...extra,
  };
}

const USERS = [
  user('a', { rotation_order: 1 }),
  user('b', { rotation_order: 2 }),
  user('c', { rotation_order: 3 }),
  user('gone', { active: false, rotation_order: 4 }),
  user('prof', { role: 'professor' }),
  user('root', { role: 'admin' }),
];

function lead(week_key: string, user_id: string): WeekLeadRecord {
  return { id: `wl-${week_key}`, week_key, user_id, created_at: '', updated_at: '', row_version: 1, created_by: '' };
}

/** W50 (7-13 Dec 2026) is a whole-week break. */
const BREAKS: TermBreakRecord[] = [
  { id: 'br', name: 'ปิดภาค', start_date: '2026-12-07', end_date: '2026-12-13', created_at: '', updated_at: '', row_version: 1, created_by: '' },
];

function clip(id: string, extra: Partial<ClipRecord> = {}): ClipRecord {
  return {
    id,
    created_at: '2026-11-01',
    updated_at: '',
    row_version: 1,
    created_by: 'a',
    series_id: 's1',
    episode_no: 1,
    week_key: '',
    scheduled_at: '',
    title: id,
    details: '',
    maker_id: '',
    status: 'planned',
    status_at: '',
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
    ...extra,
  };
}

describe('clipMaker', () => {
  const leads = [lead('2026-W45', 'a'), lead('2026-W46', 'b'), lead('2026-W47', 'gone')];
  const maker = (week_key: string, extra: Partial<ClipRecord> = {}, l = leads) =>
    clipMaker({ week_key, ...extra }, l, USERS, BREAKS, TODAY);

  it("is last working week's lead -- whether or not a meeting was held (D1, D2)", () => {
    expect(maker('2026-W46')).toEqual({ kind: 'rotation', userId: 'a', hostWeek: '2026-W45', afterBreak: false });
    expect(maker('2026-W47')).toMatchObject({ kind: 'rotation', userId: 'b', hostWeek: '2026-W46' });
  });

  it('keeps a maker frozen when work started, wherever the episode moves', () => {
    expect(maker('2026-W46', { maker_id: 'c' })).toEqual({ kind: 'pinned', userId: 'c' });
    expect(maker('', { maker_id: 'c' })).toEqual({ kind: 'pinned', userId: 'c' });
  });

  it('has nobody while the episode is queued', () => {
    expect(maker('')).toEqual({ kind: 'none', reason: 'unscheduled' });
  });

  it('has nobody in a break week', () => {
    expect(maker('2026-W50')).toEqual({ kind: 'none', reason: 'breakWeek' });
  });

  it('skips a break to the last working week before it', () => {
    const l = [...leads, lead('2026-W49', 'c')];
    expect(maker('2026-W51', {}, l)).toEqual({ kind: 'rotation', userId: 'c', hostWeek: '2026-W49', afterBreak: true });
  });

  it('says so when the host has left the lab, rather than guessing (D28)', () => {
    expect(maker('2026-W48')).toEqual({ kind: 'none', reason: 'hostLeft', hostWeek: '2026-W47', userId: 'gone' });
  });

  it('says so when the host account was deleted', () => {
    const l = [lead('2026-W44', 'nobody-here')];
    expect(maker('2026-W45', {}, l)).toEqual({ kind: 'none', reason: 'hostDeleted', hostWeek: '2026-W44' });
  });

  it('says so when no lead was recorded for a past week', () => {
    expect(maker('2026-W44')).toEqual({ kind: 'none', reason: 'noHost', hostWeek: '2026-W43' });
  });

  it('projects the rotation for a week ahead that is not confirmed yet', () => {
    // W47's lead has left, so the rotation starts again from the top: a.
    expect(maker('2026-W49')).toEqual({ kind: 'projected', userId: 'a', hostWeek: '2026-W48', afterBreak: false });
  });

  it('crosses a year boundary', () => {
    const l = [lead('2026-W53', 'b')];
    expect(clipMaker({ week_key: '2027-W01' }, l, USERS, [], '2027-W01')).toMatchObject({
      kind: 'rotation',
      userId: 'b',
      hostWeek: '2026-W53',
    });
  });

  it('reads the first row when a week has two (the same rule as the history page)', () => {
    const l = [lead('2026-W45', 'a'), { ...lead('2026-W45', 'b'), id: 'dup' }];
    expect(maker('2026-W46', {}, l)).toMatchObject({ userId: 'a' });
  });
});

describe('booking weeks', () => {
  it('offers 13 working weeks from this one, skipping breaks', () => {
    const weeks = bookableWeeks(BREAKS, TODAY);
    expect(weeks).toHaveLength(13);
    expect(weeks[0]).toBe('2026-W46');
    expect(weeks).not.toContain('2026-W50');
    expect(weeks.at(-1)).toBe('2027-W06');
  });

  it('finds the next free week, past booked weeks and breaks', () => {
    const clips = [clip('x', { week_key: '2026-W46' }), clip('y', { week_key: '2026-W47' })];
    expect(nextFreeWeek(clips, BREAKS, TODAY, TODAY)).toBe('2026-W48');
    const more = [...clips, clip('z', { week_key: '2026-W48' }), clip('w', { week_key: '2026-W49' })];
    expect(nextFreeWeek(more, BREAKS, TODAY, TODAY)).toBe('2026-W51');
  });

  it('starts after the series’ earlier episodes, so a series stays in order', () => {
    const clips = [
      clip('e1', { episode_no: 1, week_key: '2026-W48' }),
      clip('e2', { episode_no: 2 }),
      clip('other', { series_id: 's2', episode_no: 9, week_key: '2026-W52' }),
    ];
    const from = seriesStartWeek(clips, clips[1], TODAY);
    expect(from).toBe('2026-W49');
    expect(nextFreeWeek(clips, BREAKS, from, TODAY)).toBe('2026-W49');
    // A first episode starts from this week.
    expect(seriesStartWeek(clips, clips[0], TODAY)).toBe(TODAY);
  });

  it('gives up past the 13-week horizon', () => {
    const full = bookableWeeks(BREAKS, TODAY).map((week_key, i) => clip(`c${i}`, { week_key }));
    expect(nextFreeWeek(full, BREAKS, TODAY, TODAY)).toBeNull();
  });

  it('names what is wrong with a chosen week', () => {
    const clips = [clip('x', { week_key: '2026-W47' })];
    expect(weekProblem('2026-W45', clips, BREAKS, null, TODAY)).toBe('pastWeek');
    expect(weekProblem('2026-W50', clips, BREAKS, null, TODAY)).toBe('breakWeek');
    expect(weekProblem('2027-W07', clips, BREAKS, null, TODAY)).toBe('beyondHorizon');
    expect(weekProblem('2027-W06', clips, BREAKS, null, TODAY)).toBeNull();
    expect(weekProblem('2026-W47', clips, BREAKS, null, TODAY)).toBe('weekTaken');
    // An episode does not clash with itself.
    expect(weekProblem('2026-W47', clips, BREAKS, 'x', TODAY)).toBeNull();
    expect(weekProblem('nonsense', clips, BREAKS, null, TODAY)).toBe('badWeek');
  });

  it('gives a week claimed twice to the one booked first, and marks both', () => {
    const clips = [
      clip('late', { week_key: '2026-W47', scheduled_at: '2026-11-10T02:00:00Z' }),
      clip('early', { week_key: '2026-W47', scheduled_at: '2026-11-10T01:00:00Z' }),
      clip('alone', { week_key: '2026-W48', scheduled_at: '2026-11-10T01:00:00Z' }),
    ];
    expect(canonicalForWeek(clips, '2026-W47')?.id).toBe('early');
    expect([...clashingIds(clips)].sort()).toEqual(['early', 'late']);
    expect(canonicalForWeek(clips, '2026-W49')).toBeNull();
  });

  it('numbers a new episode after the highest in its series', () => {
    const clips = [clip('a1', { episode_no: 1 }), clip('a3', { episode_no: 3 }), clip('b9', { series_id: 's2', episode_no: 9 })];
    expect(nextEpisodeNo('s1', clips)).toBe(4);
    expect(nextEpisodeNo('s3', clips)).toBe(1);
  });
});

describe('the 5:00 cap', () => {
  it('reads min:sec or plain seconds', () => {
    expect(parseDuration('4:30')).toBe(270);
    expect(parseDuration('5:00')).toBe(300);
    expect(parseDuration('5:01')).toBe(301);
    expect(parseDuration('90')).toBe(90);
    expect(parseDuration('4:75')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
  });

  it('allows 1 to 300 seconds and nothing else', () => {
    expect(isAllowedDuration(0)).toBe(false);
    expect(isAllowedDuration(1)).toBe(true);
    expect(isAllowedDuration(300)).toBe(true);
    expect(isAllowedDuration(301)).toBe(false);
    expect(isAllowedDuration(12.5)).toBe(false);
  });

  it('writes seconds back as min:sec', () => {
    expect(formatDuration(301)).toBe('5:01');
    expect(formatDuration(9)).toBe('0:09');
  });
});

describe('stages (D9, D26)', () => {
  const base = { status: 'planned', week_key: '2026-W47', planner_id: 'p', duration_sec: '' as number | string };

  it('needs a week and a planner to start production', () => {
    expect(transitionProblem({ ...base, week_key: '' }, 'in_production', false)).toBe('needsWeek');
    expect(transitionProblem({ ...base, planner_id: '' }, 'in_production', false)).toBe('plannerRequired');
    expect(transitionProblem(base, 'in_production', false)).toBeNull();
  });

  it('needs a length of at most 5:00 to be ready', () => {
    const working = { ...base, status: 'in_production' };
    expect(transitionProblem(working, 'ready', false)).toBe('durationRequired');
    expect(transitionProblem({ ...working, duration_sec: 301 }, 'ready', false)).toBe('durationRequired');
    expect(transitionProblem({ ...working, duration_sec: 300 }, 'ready', false)).toBeNull();
  });

  it('moves one step at a time, publishing only through the publish form', () => {
    expect(transitionProblem(base, 'ready', false)).toBe('notOneStep');
    expect(transitionProblem({ ...base, status: 'ready', duration_sec: 200 }, 'published', false)).toBe('usePublishForm');
    expect(transitionProblem({ ...base, status: 'ready' }, 'in_production', false)).toBeNull();
  });

  it('keeps stepping back from published, and skipping, for admin', () => {
    const published = { ...base, status: 'published', duration_sec: 200 };
    expect(transitionProblem(published, 'ready', false)).toBe('adminOnly');
    expect(transitionProblem(published, 'ready', true)).toBeNull();
    expect(transitionProblem(base, 'skipped', false)).toBe('adminOnly');
    expect(transitionProblem(base, 'skipped', true)).toBeNull();
    expect(transitionProblem({ ...base, status: 'skipped' }, 'planned', true)).toBeNull();
    expect(transitionProblem({ ...base, status: 'skipped' }, 'in_production', true)).toBe('notOneStep');
    expect(transitionProblem(published, 'skipped', true)).toBe('notOneStep');
  });
});

describe('dates', () => {
  it('is due Sunday 23:59 in the lab, unless a date was set', () => {
    expect(dueAt({ due_at: '', week_key: '2026-W46' })).toBe('2026-11-15T16:59:00.000Z');
    expect(dueAt({ due_at: '2026-11-12T16:59:00.000Z', week_key: '2026-W46' })).toBe('2026-11-12T16:59:00.000Z');
    expect(dueAt({ due_at: '', week_key: '' })).toBeNull();
  });

  it('is late past its due time unless published or skipped', () => {
    const after = new Date('2026-11-16T00:00:00Z');
    expect(isLate({ due_at: '', week_key: '2026-W46', status: 'in_production' }, after)).toBe(true);
    expect(isLate({ due_at: '', week_key: '2026-W46', status: 'published' }, after)).toBe(false);
    expect(isLate({ due_at: '', week_key: '2026-W46', status: 'planned' }, new Date('2026-11-12T00:00:00Z'))).toBe(false);
  });

  it('shows a move notice for 14 days', () => {
    const now = new Date('2026-11-30T00:00:00Z');
    expect(moveNoticeActive({ moved_at: '2026-11-17T00:00:00Z' }, now)).toBe(true);
    expect(moveNoticeActive({ moved_at: '2026-11-15T00:00:00Z' }, now)).toBe(false);
    expect(moveNoticeActive({ moved_at: '' }, now)).toBe(false);
  });
});

describe('series', () => {
  it('counts episodes from the rows, never stored', () => {
    const clips = [
      clip('p', { status: 'published', week_key: '2026-W44' }),
      clip('w', { status: 'in_production', week_key: '2026-W46' }),
      clip('r', { status: 'ready', week_key: '2026-W45' }),
      clip('n', { week_key: '2026-W48' }),
      clip('q'),
      clip('other', { series_id: 's2' }),
    ];
    const sum = seriesSummary('s1', clips, TODAY);
    expect(sum).toMatchObject({ episodes: 5, published: 1, inProgress: 2, planned: 1, queued: 1 });
    expect(sum.next?.id).toBe('w');
  });

  it('keeps a stored colour and derives one otherwise', () => {
    expect(seriesColor({ id: 'x', color: 'sky' })).toBe('sky');
    expect(seriesColor({ id: 'x', color: '' })).toBe(seriesColor({ id: 'x', color: 'bogus' }));
  });
});

describe('links', () => {
  it('keeps https links and refuses everything else', () => {
    expect(safeHttpsUrl('https://drive.google.com/x')).toBe('https://drive.google.com/x');
    expect(safeHttpsUrl('http://example.com')).toBeNull();
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('data:text/html,hi')).toBeNull();
    expect(safeHttpsUrl('https://user:pw@example.com')).toBeNull();
    expect(safeHttpsUrl(`https://example.com/${'a'.repeat(2100)}`)).toBeNull();
  });

  it('accepts Facebook hosts by their parsed name only', () => {
    expect(isLabFacebookUrl('https://www.facebook.com/lab/videos/1')).toBe(true);
    expect(isLabFacebookUrl('https://facebook.com/reel/1')).toBe(true);
    expect(isLabFacebookUrl('https://m.facebook.com/story.php')).toBe(true);
    expect(isLabFacebookUrl('https://fb.watch/abc')).toBe(true);
    expect(isLabFacebookUrl('https://facebook.com.evil.example/x')).toBe(false);
    expect(isLabFacebookUrl('https://evil-facebook.com/x')).toBe(false);
    expect(isLabFacebookUrl('http://facebook.com/x')).toBe(false);
  });
});
