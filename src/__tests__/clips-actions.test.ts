/**
 * The weekly clips' server actions, tested through the actions themselves.
 *
 * Everybody signed in manages clip content (owner, D22), so most of what is
 * checked here is the data rules -- free weeks only, the 13-week horizon, the
 * 5:00 cap, starting production with no extra input -- plus the few things that stay
 * admin's: deleting a series and changing a published episode.
 *
 * The sheet and the session are mocked. The mock repository keeps rows in
 * memory and honours row_version and update's uniqueBy the way SheetRepo
 * does, so a stale screen and a double booking can both be shown.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ClipRecord } from '../lib/db/schema';
import { episodeDeleteProblem, episodeEditProblem } from '../lib/clips';

const getServerSessionMock = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: () => getServerSessionMock() }));
vi.mock('../lib/auth', () => ({ authOptions: {} }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

// The role preview travels in a cookie.
const preview = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => (preview.value === undefined ? undefined : { value: preview.value }) }),
  headers: async () => new Headers(),
}));

type Row = Record<string, unknown> & { id: string; row_version: number };
const store = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  Conflict: null as null | (new (detail: string) => Error),
  seq: 0,
}));

const insert = vi.fn(
  async (table: string, doc: Record<string, unknown>, actorId?: string, options?: { uniqueBy?: Record<string, unknown> }) => {
    const rows = (store.tables[table] ??= []);
    if (options?.uniqueBy) {
      const hit = rows.find((r) => Object.entries(options.uniqueBy!).every(([k, v]) => String(r[k]) === String(v)));
      if (hit) return hit;
    }
    const row: Row = {
      created_at: new Date().toISOString(),
      created_by: actorId ?? 'system',
      ...doc,
      id: typeof doc.id === 'string' && doc.id ? doc.id : `${table}-${++store.seq}`,
      row_version: 1,
    };
    rows.push(row);
    return row;
  }
);

const update = vi.fn(
  async (
    table: string,
    id: string,
    fields: Record<string, unknown>,
    expectedVersion: number,
    _actorId?: string,
    options?: { uniqueBy?: Record<string, unknown> }
  ) => {
    const rows = store.tables[table] ?? [];
    const row = rows.find((r) => r.id === id);
    if (!row) throw new Error(`no row ${id}`);
    if (row.row_version !== expectedVersion) throw new store.Conflict!('stale');
    if (options?.uniqueBy) {
      const entries = Object.entries(options.uniqueBy).filter(([, v]) => v !== '');
      if (entries.length && rows.some((r) => r.id !== id && entries.every(([k, v]) => r[k] === v))) {
        throw new store.Conflict!('unique');
      }
    }
    Object.assign(row, fields, { row_version: row.row_version + 1 });
    return row;
  }
);
const remove = vi.fn(async (table: string, id: string, expectedVersion: number) => {
  const rows = store.tables[table] ?? [];
  const at = rows.findIndex((r) => r.id === id);
  if (at === -1) return;
  if (rows[at].row_version !== expectedVersion) throw new store.Conflict!('stale');
  rows.splice(at, 1);
});

vi.mock('../lib/db/sheet-repo', async () => {
  const { UserError } = await import('../lib/user-error');
  class ConflictError extends UserError {
    constructor(detail: string) {
      super('error.conflict', undefined, detail);
    }
  }
  store.Conflict = ConflictError;
  return {
    ConflictError,
    SheetRepo: {
      find: async (table: string) => store.tables[table] ?? [],
      findOne: async (table: string, id: string) => (store.tables[table] ?? []).find((r) => r.id === id) ?? null,
      insert: (...args: Parameters<typeof insert>) => insert(...args),
      update: (...args: Parameters<typeof update>) => update(...args),
      delete: (table: string, id: string, v: number) => remove(table, id, v),
      deleteMany: async (table: string, items: { id: string; expectedVersion: number }[]) => {
        for (const item of items) await remove(table, item.id, item.expectedVersion);
      },
    },
  };
});

const actions = await import('../app/(app)/clips/actions');

/** Wednesday of 2026-W46 in Bangkok. */
const NOW = '2026-11-11T12:00:00+07:00';

function signedInAs(id: string, role = 'student') {
  getServerSessionMock.mockResolvedValue({ user: { id, name: id, email: `${id}@lab`, role } });
}

function user(id: string, extra: Record<string, unknown> = {}): Row {
  return { id, name: id, role: 'student', active: true, rotation_order: '', created_at: '2026-01-01', row_version: 1, ...extra };
}

function clip(id: string, extra: Record<string, unknown> = {}): Row {
  return {
    id,
    row_version: 1,
    created_by: 'a',
    created_at: '2026-11-01',
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

const rowOf = (id: string) => store.tables.clips.find((r) => r.id === id)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(NOW));
  getServerSessionMock.mockReset();
  preview.value = undefined;
  insert.mockClear();
  update.mockClear();
  remove.mockClear();
  store.seq = 0;
  store.tables = {
    users: [
      user('a', { rotation_order: 1 }),
      user('b', { rotation_order: 2 }),
      user('c', { rotation_order: 3 }),
      user('gone', { active: false }),
      user('prof', { role: 'professor' }),
      user('root', { role: 'admin' }),
    ],
    week_leads: [
      { id: 'wl45', week_key: '2026-W45', user_id: 'a', row_version: 1 },
      { id: 'wl46', week_key: '2026-W46', user_id: 'b', row_version: 1 },
    ],
    // 2026-W50 is a whole-week break.
    term_breaks: [{ id: 'br', name: 'break', start_date: '2026-12-07', end_date: '2026-12-13', row_version: 1 }],
    clip_series: [{ id: 's1', title: 'Sensors', created_by: 'a', row_version: 1, status: 'active', color: '' }],
    clips: [
      clip('e1', { episode_no: 1, week_key: '2026-W47', scheduled_at: '2026-11-01T00:00:00Z' }),
      clip('e2', { episode_no: 2 }),
      clip('pub', {
        episode_no: 3,
        week_key: '2026-W46',
        status: 'published',
        duration_sec: 200,
        maker_id: 'a',
        published_url: 'https://www.facebook.com/lab/videos/1',
      }),
    ],
  };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('signing in', () => {
  it('refuses every action to somebody signed out', async () => {
    getServerSessionMock.mockResolvedValue(null);
    expect(await actions.createSeriesAction({ title: 'X' })).toMatchObject({ ok: false, error: 'error.signInRequired' });
    expect(await actions.bookEpisodeAction('e2', 1, 'next')).toMatchObject({ ok: false, error: 'error.signInRequired' });
    expect(await actions.setEpisodeStatusAction('e1', 'in_production', 1)).toMatchObject({ ok: false, error: 'error.signInRequired' });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe('creating topics (D3, D17, D18)', () => {
  it('lets a student start a series with episodes, numbered uniquely', async () => {
    signedInAs('c');
    const res = await actions.createSeriesAction({ title: 'ROS basics', episodes: ['Nodes', 'Topics'] });
    expect(res.ok).toBe(true);
    const episodes = insert.mock.calls.filter(([table]) => table === 'clips');
    expect(episodes).toHaveLength(2);
    expect(episodes.map(([, doc]) => doc.episode_no)).toEqual([1, 2]);
    expect(episodes[0][3]).toEqual({ uniqueBy: { series_id: expect.any(String), episode_no: 1 } });
    // Queued: no week, and nobody set as maker.
    expect(episodes[0][1]).toMatchObject({ week_key: '', maker_id: '' });
  });

  it('lets a professor add an episode to somebody else’s series, at the end', async () => {
    signedInAs('prof', 'professor');
    const res = await actions.addEpisodeAction('s1', { title: 'LiDAR' });
    expect(res.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      'clips',
      expect.objectContaining({ series_id: 's1', episode_no: 4 }),
      'prof',
      { uniqueBy: { series_id: 's1', episode_no: 4 } }
    );
  });

  it('makes a topic without episode titles a one-off, its episode named after it', async () => {
    signedInAs('b');
    const res = await actions.createSeriesAction({ title: 'Safety' });
    expect(res).toMatchObject({ ok: true, added: 1, booked: 0 });
    expect(insert).toHaveBeenCalledWith('clip_series', expect.objectContaining({ title: 'Safety' }), 'b');
    expect(insert).toHaveBeenCalledWith(
      'clips',
      expect.objectContaining({ title: 'Safety', episode_no: 1, week_key: '' }),
      'b',
      expect.anything()
    );
  });

  it('books a new topic’s episodes into the next free weeks, in order, past breaks', async () => {
    signedInAs('b');
    const res = await actions.createSeriesAction({ title: 'ROS', episodes: ['Nodes', 'Topics', 'Services'], book: true });
    expect(res).toMatchObject({ ok: true, added: 3, booked: 3 });
    // W46 and W47 are taken and W50 is a break.
    const weeks = Object.fromEntries(
      store.tables.clips.filter((c) => c.series_id !== 's1').map((c) => [c.title, c.week_key])
    );
    expect(weeks).toEqual({ Nodes: '2026-W48', Topics: '2026-W49', Services: '2026-W51' });
    for (const [table, , fields, , , options] of update.mock.calls) {
      expect(table).toBe('clips');
      expect(options).toEqual({ uniqueBy: { week_key: fields.week_key } });
    }
  });

  it('keeps the episodes it could not book queued, and says how many', async () => {
    signedInAs('b');
    // Fill every free week but the first.
    let n = 10;
    for (const week of ['2026-W49', '2026-W51', '2026-W52', '2026-W53', '2027-W01', '2027-W02', '2027-W03', '2027-W04', '2027-W05', '2027-W06']) {
      store.tables.clips.push(clip(`f${n}`, { series_id: 'other', episode_no: n++, week_key: week }));
    }
    const res = await actions.createSeriesAction({ title: 'ROS', episodes: ['Nodes', 'Topics'], book: true });
    expect(res).toMatchObject({ ok: true, added: 2, booked: 1 });
    const mine = store.tables.clips.filter((c) => c.series_id !== 's1' && c.series_id !== 'other');
    expect(mine.map((c) => c.week_key)).toEqual(['2026-W48', '']);
  });

  it('can book an added episode straight away', async () => {
    signedInAs('c');
    expect(await actions.addEpisodeAction('s1', { title: 'LiDAR', book: true })).toMatchObject({ ok: true, booked: true });
    expect(store.tables.clips.find((c) => c.title === 'LiDAR')?.week_key).toBe('2026-W48');
  });

  it('refuses a title that is too long', async () => {
    signedInAs('b');
    const res = await actions.createSeriesAction({ title: 'x'.repeat(121) });
    expect(res).toMatchObject({ ok: false, error: 'clips.error.titleTooLong' });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('booking and moving (D4, D19, D20)', () => {
  it('books the next free week after the series’ earlier episodes, unique on the week', async () => {
    signedInAs('c');
    const res = await actions.bookEpisodeAction('e2', 1, 'next');
    expect(res).toMatchObject({ ok: true, week: '2026-W48' });
    expect(update).toHaveBeenCalledWith(
      'clips',
      'e2',
      expect.objectContaining({ week_key: '2026-W48', scheduled_at: expect.any(String) }),
      1,
      'c',
      { uniqueBy: { week_key: '2026-W48' } }
    );
  });

  it.each([
    ['2026-W47', 'clips.error.weekTaken'],
    ['2026-W50', 'clips.error.breakWeek'],
    ['2026-W45', 'clips.error.pastWeek'],
    ['2027-W07', 'clips.error.beyondHorizon'],
    ['2026-W60', 'clips.error.badWeek'],
  ])('refuses to book %s', async (week, error) => {
    signedInAs('c');
    expect(await actions.bookEpisodeAction('e2', 1, week)).toMatchObject({ ok: false, error });
    expect(update).not.toHaveBeenCalled();
  });

  it('lets anybody move an episode in production to a free week, keeping its maker', async () => {
    Object.assign(rowOf('e1'), { status: 'in_production', maker_id: 'b' });
    signedInAs('prof', 'professor');
    const res = await actions.moveEpisodeAction('e1', 1, '2026-W49');
    expect(res).toMatchObject({ ok: true, week: '2026-W49' });
    const fields = update.mock.calls[0][2];
    expect(fields).toMatchObject({
      week_key: '2026-W49',
      moved_from: '2026-W47',
      moved_by: 'prof',
      moved_at: expect.any(String),
    });
    expect(fields).not.toHaveProperty('maker_id');
    expect(fields).not.toHaveProperty('due_at');
    expect(rowOf('e1').maker_id).toBe('b');
  });

  it('refuses to move into a taken week, or a published episode for a non-admin', async () => {
    signedInAs('c');
    expect(await actions.moveEpisodeAction('e1', 1, '2026-W46')).toMatchObject({ error: 'clips.error.weekTaken' });
    expect(await actions.moveEpisodeAction('pub', 1, '2026-W49')).toMatchObject({ error: 'clips.error.publishedLocked' });
    expect(await actions.unbookEpisodeAction('pub', 1)).toMatchObject({ error: 'clips.error.publishedLocked' });
    expect(update).not.toHaveBeenCalled();

    signedInAs('root', 'admin');
    expect(await actions.moveEpisodeAction('pub', 1, '2026-W49')).toMatchObject({ ok: true });
  });

  it('reports a week taken by somebody else a moment before the write', async () => {
    signedInAs('c');
    update.mockImplementationOnce(async () => {
      // Another server books W49 between this action's read and its write.
      store.tables.clips.push(clip('rival', { series_id: 's2', week_key: '2026-W49' }));
      throw new store.Conflict!('unique');
    });
    expect(await actions.moveEpisodeAction('e1', 1, '2026-W49')).toMatchObject({ ok: false, error: 'clips.error.weekTaken' });
  });

  it('retries the next free week when the one it picked was just taken', async () => {
    signedInAs('c');
    update.mockImplementationOnce(async () => {
      store.tables.clips.push(clip('rival', { series_id: 's2', week_key: '2026-W48' }));
      throw new store.Conflict!('unique');
    });
    expect(await actions.bookEpisodeAction('e2', 1, 'next')).toMatchObject({ ok: true, week: '2026-W49' });
  });

  it('refuses a stale screen', async () => {
    signedInAs('c');
    expect(await actions.moveEpisodeAction('e1', 7, '2026-W49')).toMatchObject({ ok: false, error: 'error.conflict' });
    expect(rowOf('e1').week_key).toBe('2026-W47');
  });

  it('unbooks into the queue and records where it was', async () => {
    signedInAs('c');
    expect(await actions.unbookEpisodeAction('e1', 1)).toMatchObject({ ok: true });
    expect(rowOf('e1')).toMatchObject({ week_key: '', moved_from: '2026-W47', moved_by: 'c' });
  });
});

describe('stages and the maker (D9, D24)', () => {
  it('freezes the derived maker when production starts, and lets it go back to the week', async () => {
    signedInAs('c');
    expect(await actions.setEpisodeStatusAction('e1', 'in_production', 1)).toMatchObject({ ok: true });
    expect(rowOf('e1')).toMatchObject({ status: 'in_production', maker_id: 'b' });
    expect(await actions.setEpisodeStatusAction('e1', 'planned', 2)).toMatchObject({ ok: true });
    expect(rowOf('e1').maker_id).toBe('');
  });

  it('starts production with no extra input, in one write, and never touches the planner column', async () => {
    signedInAs('c');
    expect(await actions.setEpisodeStatusAction('e1', 'in_production', 1)).toMatchObject({ ok: true });
    expect(rowOf('e1')).toMatchObject({ status: 'in_production', maker_id: 'b' });
    expect(update).toHaveBeenCalledTimes(1);
    const fields = update.mock.calls[0][2];
    for (const unused of ['planner_id', 'planner_set_by', 'planner_set_at', 'due_at', 'draft_url', 'notes']) {
      expect(fields).not.toHaveProperty(unused);
    }
  });

  it('records the length in the same step that marks it ready, under the 5:00 cap', async () => {
    signedInAs('c');
    rowOf('e1').status = 'in_production';
    expect(await actions.setEpisodeStatusAction('e1', 'ready', 1, { duration: '5:01' })).toMatchObject({
      error: 'clips.error.tooLong',
    });
    expect(await actions.setEpisodeStatusAction('e1', 'ready', 1, { duration: '4:30' })).toMatchObject({ ok: true });
    expect(rowOf('e1')).toMatchObject({ status: 'ready', duration_sec: 270 });
  });

  it('needs a week to start', async () => {
    signedInAs('c');
    expect(await actions.setEpisodeStatusAction('e2', 'in_production', 1)).toMatchObject({ error: 'clips.error.needsWeek' });
  });

  it('needs a length to be ready', async () => {
    signedInAs('c');
    rowOf('e1').status = 'in_production';
    expect(await actions.setEpisodeStatusAction('e1', 'ready', 1)).toMatchObject({ error: 'clips.error.durationRequired' });
  });

  it('keeps stepping back from published and skipping for admin, preview included', async () => {
    signedInAs('c');
    expect(await actions.setEpisodeStatusAction('pub', 'ready', 1)).toMatchObject({ error: 'clips.error.statusAdminOnly' });
    expect(await actions.setEpisodeStatusAction('e1', 'skipped', 1)).toMatchObject({ error: 'clips.error.statusAdminOnly' });

    signedInAs('root', 'admin');
    preview.value = 'student';
    expect(await actions.setEpisodeStatusAction('e1', 'skipped', 1)).toMatchObject({ error: 'clips.error.statusAdminOnly' });

    preview.value = undefined;
    expect(await actions.setEpisodeStatusAction('e1', 'skipped', 1)).toMatchObject({ ok: true });
  });

  it('writes maker_id only through the freeze, never from any other action', async () => {
    signedInAs('c');
    await actions.bookEpisodeAction('e2', 1, 'next');
    await actions.moveEpisodeAction('e1', 1, '2026-W49');
    await actions.updateEpisodeLengthAction('e1', '4:00', 2);
    await actions.updateEpisodeAction('e1', { title: 'New' }, 3);
    await actions.unbookEpisodeAction('e2', 2);
    for (const [, , fields] of update.mock.calls) expect(fields).not.toHaveProperty('maker_id');
  });
});

describe('the 5:00 cap (D12)', () => {
  it.each([
    ['5:01', 'clips.error.tooLong'],
    ['0:00', 'clips.error.durationInvalid'],
    ['abc', 'clips.error.durationInvalid'],
  ])('refuses %s', async (duration, error) => {
    signedInAs('c');
    expect(await actions.updateEpisodeLengthAction('e1', duration, 1)).toMatchObject({ ok: false, error });
    expect(update).not.toHaveBeenCalled();
  });

  it.each([
    ['0:01', 1],
    ['5:00', 300],
  ])('accepts %s', async (duration, seconds) => {
    signedInAs('c');
    expect(await actions.updateEpisodeLengthAction('e1', duration, 1)).toMatchObject({ ok: true });
    expect(rowOf('e1').duration_sec).toBe(seconds);
  });

  it('keeps a length on a ready episode', async () => {
    signedInAs('c');
    Object.assign(rowOf('e1'), { status: 'ready', duration_sec: 240 });
    expect(await actions.updateEpisodeLengthAction('e1', '', 1)).toMatchObject({ error: 'clips.error.durationRequired' });
    expect(await actions.updateEpisodeLengthAction('e1', '3:00', 1)).toMatchObject({ ok: true });
    expect(rowOf('e1').duration_sec).toBe(180);
  });
});

describe('publishing (D6, D14)', () => {
  beforeEach(() => {
    Object.assign(rowOf('e1'), { status: 'ready', duration_sec: 240, maker_id: 'b' });
  });

  it('needs a Facebook link', async () => {
    signedInAs('c');
    const res = await actions.publishEpisodeAction(
      'e1',
      { url: 'https://facebook.com.evil.example/x', date: '2026-11-15', postedBy: 'c' },
      1
    );
    expect(res).toMatchObject({ error: 'clips.error.notFacebook' });
  });

  it('records the post and publishes', async () => {
    signedInAs('c');
    const res = await actions.publishEpisodeAction(
      'e1',
      { url: 'https://www.facebook.com/lab/videos/2', date: '2026-11-15', postedBy: 'b' },
      1
    );
    expect(res).toMatchObject({ ok: true });
    expect(rowOf('e1')).toMatchObject({ status: 'published', published_by: 'b', published_at: '2026-11-15T05:00:00.000Z' });
  });

  it('cannot be done before ready', async () => {
    signedInAs('c');
    rowOf('e1').status = 'in_production';
    const res = await actions.publishEpisodeAction(
      'e1',
      { url: 'https://fb.watch/x', date: '2026-11-15', postedBy: 'b' },
      1
    );
    expect(res).toMatchObject({ error: 'clips.error.notReady' });
  });

  it('leaves a published record to admin', async () => {
    signedInAs('c');
    expect(await actions.updateEpisodeLengthAction('pub', '4:00', 1)).toMatchObject({ error: 'clips.error.publishedLocked' });
    expect(
      await actions.publishEpisodeAction('pub', { url: 'https://fb.watch/y', date: '2026-11-15', postedBy: 'b' }, 1)
    ).toMatchObject({ error: 'clips.error.publishedLocked' });
  });
});

describe('deleting', () => {
  it('keeps deleting a series to a real admin', async () => {
    for (const [id, role] of [
      ['a', 'student'],
      ['prof', 'professor'],
    ]) {
      signedInAs(id, role);
      expect(await actions.deleteSeriesAction('s1', 1)).toMatchObject({ ok: false, error: 'error.roleRequired' });
    }
    signedInAs('root', 'admin');
    preview.value = 'student';
    expect(await actions.deleteSeriesAction('s1', 1)).toMatchObject({ ok: false, error: 'error.roleRequired' });
    expect(remove).not.toHaveBeenCalled();

    preview.value = undefined;
    expect(await actions.deleteSeriesAction('s1', 1)).toMatchObject({ ok: true });
    expect(store.tables.clips).toHaveLength(0);
    expect(store.tables.clip_series).toHaveLength(0);
  });

  it('lets the author or the series keeper remove a planned episode, and nobody else', async () => {
    rowOf('e2').created_by = 'b';
    signedInAs('c');
    expect(await actions.deleteEpisodeAction('e2', 1)).toMatchObject({ error: 'error.forbidden' });
    signedInAs('b');
    expect(await actions.deleteEpisodeAction('e2', 1)).toMatchObject({ ok: true });
    // 'a' created the series.
    signedInAs('a');
    expect(await actions.deleteEpisodeAction('e1', 1)).toMatchObject({ ok: true });
  });

  it('leaves an episode whose work has started to admin', async () => {
    rowOf('e1').status = 'in_production';
    signedInAs('a');
    expect(await actions.deleteEpisodeAction('e1', 1)).toMatchObject({ error: 'clips.error.deleteAdminOnly' });
  });
});

describe('past weeks', () => {
  it('locks an episode’s text once its week is over, except for admin', async () => {
    rowOf('e1').week_key = '2026-W45';
    signedInAs('a');
    expect(await actions.updateEpisodeAction('e1', { title: 'Late rename' }, 1)).toMatchObject({
      error: 'clips.error.pastWeekLocked',
    });
    signedInAs('root', 'admin');
    expect(await actions.updateEpisodeAction('e1', { title: 'Fixed' }, 1)).toMatchObject({ ok: true });
  });
});

describe('the edit and delete icons follow the actions', () => {
  // [signed in as, real role, role preview]. 'a' looks after series s1, 'b'
  // added the episode, 'c' is neither.
  const ACTORS: [string, string, string | undefined][] = [
    ['a', 'student', undefined],
    ['b', 'student', undefined],
    ['c', 'student', undefined],
    ['prof', 'professor', undefined],
    ['root', 'admin', undefined],
    ['root', 'admin', 'student'],
  ];
  const STATES = [
    { status: 'planned', week_key: '' },
    { status: 'planned', week_key: '2026-W48' },
    { status: 'planned', week_key: '2026-W45' },
    { status: 'in_production', week_key: '2026-W46' },
    { status: 'ready', week_key: '2026-W46' },
    { status: 'published', week_key: '2026-W44' },
    { status: 'skipped', week_key: '2026-W43' },
  ];

  /** A fresh e2 in the given state, added by 'b'. */
  function reset(state: Record<string, unknown>) {
    store.tables.clips = store.tables.clips.filter((r) => r.id !== 'e2');
    store.tables.clips.push(clip('e2', { episode_no: 2, created_by: 'b', ...state }));
    return rowOf('e2') as unknown as ClipRecord;
  }

  /** The role the pages see: the preview's, if an admin is previewing. */
  const seenRole = (role: string, previewing: string | undefined) => previewing ?? role;

  it('shows the pencil exactly when updateEpisodeAction would save', async () => {
    for (const [id, role, previewing] of ACTORS) {
      for (const state of STATES) {
        const row = reset(state);
        signedInAs(id, role);
        preview.value = previewing;
        const shown = episodeEditProblem({ role: seenRole(role, previewing) }, row, '2026-W46') === null;
        const res = await actions.updateEpisodeAction('e2', { title: 'Renamed' }, 1);
        expect(res.ok, `${id}/${previewing ?? role} on ${state.status} ${state.week_key}`).toBe(shown);
      }
    }
  });

  it('shows the bin exactly when deleteEpisodeAction would delete', async () => {
    for (const [id, role, previewing] of ACTORS) {
      for (const state of STATES) {
        const row = reset(state);
        signedInAs(id, role);
        preview.value = previewing;
        // Series s1 was created by 'a'.
        const shown = episodeDeleteProblem({ id, role: seenRole(role, previewing) }, row, 'a') === null;
        const res = await actions.deleteEpisodeAction('e2', 1);
        expect(res.ok, `${id}/${previewing ?? role} on ${state.status} ${state.week_key}`).toBe(shown);
      }
    }
  });

  it('shows the icons to the right people', () => {
    const planned = { status: 'planned', week_key: '2026-W48', created_by: 'b' };
    expect(episodeDeleteProblem({ id: 'a', role: 'student' }, planned, 'a')).toBeNull();
    expect(episodeDeleteProblem({ id: 'b', role: 'student' }, planned, 'a')).toBeNull();
    expect(episodeDeleteProblem({ id: 'c', role: 'student' }, planned, 'a')).toBe('forbidden');
    expect(episodeDeleteProblem({ id: 'a', role: 'student' }, { ...planned, status: 'ready' }, 'a')).toBe('adminOnly');
    expect(episodeDeleteProblem({ id: 'root', role: 'admin' }, { ...planned, status: 'published' }, 'a')).toBeNull();
    expect(episodeEditProblem({ role: 'student' }, planned, '2026-W46')).toBeNull();
    expect(episodeEditProblem({ role: 'student' }, { ...planned, week_key: '2026-W45' }, '2026-W46')).toBe('pastWeekLocked');
    expect(episodeEditProblem({ role: 'student' }, { ...planned, status: 'published' }, '2026-W46')).toBe('publishedLocked');
    expect(episodeEditProblem({ role: 'admin' }, { ...planned, status: 'published', week_key: '2026-W40' }, '2026-W46')).toBeNull();
  });
});
