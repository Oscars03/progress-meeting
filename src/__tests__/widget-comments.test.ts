/**
 * /api/widget/comments: one week's comments for whoever holds a widget key.
 *
 * Reachable from the public internet with nothing but that key, so the first
 * things proven are that it refuses keys exactly as /api/widget does, that a
 * malformed week is turned away, that nothing outside the week -- or hidden by
 * the app -- comes back, and that it writes nothing but the key's own day.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { weekKey } from '../lib/week';

const tables: Record<string, unknown[]> = {};
const failing = new Set<string>();
const updateMock = vi.fn(async () => ({}));
const insertMock = vi.fn(async () => ({}));
const deleteMock = vi.fn(async () => ({}));

vi.mock('../lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: async (table: string) => {
      if (failing.has(table)) throw new Error(`cannot read ${table}`);
      return structuredClone(tables[table] ?? []);
    },
    update: (...args: unknown[]) => updateMock(...(args as [])),
    insert: (...args: unknown[]) => insertMock(...(args as [])),
    delete: (...args: unknown[]) => deleteMock(...(args as [])),
  },
}));

const { generateWidgetKey, hashWidgetKey } = await import('../lib/widget-key');
const { isWeekKey, readWeekParam } = await import('../lib/widget-comments');
const { activeWeekKey } = await import('../lib/rotation');
const { GET } = await import('../app/api/widget/comments/route');

// Tuesday 22 Sep 2026, 12:00 in the lab (UTC+7) -- ISO week 2026-W39.
const NOW = new Date('2026-09-22T05:00:00.000Z');
const WEEK = weekKey(NOW);

const base = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  row_version: 1,
  created_by: 'u-admin',
  ...extra,
});

const comment = (id: string, entity_type: string, entity_id: string, author_id: string, created_at: string) =>
  base(id, { entity_type, entity_id, body: `body of ${id}`, author_id, mention_ids: ['u-ann'], created_at });

function fixtures() {
  return {
    users: [
      base('u-me', { name: 'Me', email: 'me@lab.test', role: 'student', active: true }),
      base('u-ann', { name: 'Ann', email: 'ann@lab.test', role: 'student', active: true }),
      base('u-prof', { name: 'Prof', email: 'prof@lab.test', role: 'professor', active: true }),
      base('u-gone', { name: 'Gone', email: 'gone@lab.test', role: 'student', active: false }),
    ],
    meetings: [
      base('m-past', { title: 'Last week', start_at: '2026-09-15T06:30:00.000Z', end_at: '2026-09-15T08:00:00.000Z', status: 'scheduled' }),
      base('m-cancelled', { title: 'Called off', start_at: '2026-09-23T06:30:00.000Z', end_at: '2026-09-23T08:00:00.000Z', status: 'cancelled' }),
      base('m-this', { title: 'Progress meeting', start_at: '2026-09-24T06:30:00.000Z', end_at: '2026-09-24T08:00:00.000Z', status: 'scheduled' }),
    ],
    topics: [
      base('t-this', { title: 'My result', owner_id: 'u-me', week_key: WEEK, status: 'submitted', task_id: 'k-picked' }),
      base('t-dropped', { title: 'Withdrawn', owner_id: 'u-ann', week_key: WEEK, status: 'dropped', task_id: 'k-behind-dropped' }),
      base('t-other', { title: 'Last week', owner_id: 'u-me', week_key: '2026-W38', status: 'submitted' }),
    ],
    tasks: [
      base('k-linked', { title: 'Asked in the meeting', meeting_id: 'm-this', assignee_ids: ['u-ann'], status: 'todo' }),
      base('k-picked', { title: 'Picked for a topic', meeting_id: '', assignee_ids: ['u-me'], status: 'in_progress' }),
      base('k-behind-dropped', { title: 'Only a dropped topic points here', meeting_id: '', assignee_ids: ['u-ann'], status: 'todo' }),
      base('k-past', { title: 'From last week', meeting_id: 'm-past', assignee_ids: ['u-me'], status: 'todo' }),
      base('k-none', { title: 'Unrelated', meeting_id: '', assignee_ids: ['u-me'], status: 'todo' }),
    ],
    comments: [
      comment('c-meeting', 'meeting', 'm-this', 'u-ann', '2026-09-24T09:00:00.000Z'),
      comment('c-topic', 'topic', 't-this', 'u-prof', '2026-09-24T08:00:00.000Z'),
      comment('c-task', 'task', 'k-linked', 'u-prof', '2026-09-24T08:30:00.000Z'),
      comment('c-picked', 'task', 'k-picked', 'u-gone', '2026-09-24T08:40:00.000Z'),
      comment('c-cancelled', 'meetings', 'm-cancelled', 'u-me', '2026-09-23T01:00:00.000Z'),
      comment('c-removed-author', 'meeting', 'm-this', 'u-deleted', '2026-09-24T10:00:00.000Z'),
      // Not this week's, hidden by the app, or not a thing a week has.
      comment('c-past-meeting', 'meeting', 'm-past', 'u-ann', '2026-09-15T09:00:00.000Z'),
      comment('c-past-task', 'task', 'k-past', 'u-ann', '2026-09-15T09:00:00.000Z'),
      comment('c-dropped', 'topic', 't-dropped', 'u-ann', '2026-09-22T00:00:00.000Z'),
      comment('c-behind-dropped', 'task', 'k-behind-dropped', 'u-ann', '2026-09-22T00:00:00.000Z'),
      comment('c-other-topic', 'topic', 't-other', 'u-ann', '2026-09-15T00:00:00.000Z'),
      comment('c-unrelated-task', 'task', 'k-none', 'u-ann', '2026-09-22T00:00:00.000Z'),
      comment('c-feedback', 'feedback', 'm-this', 'u-ann', '2026-09-22T00:00:00.000Z'),
      comment('c-ghost', 'meeting', 'm-ghost', 'u-ann', '2026-09-22T00:00:00.000Z'),
    ],
  };
}

describe('isWeekKey', () => {
  it("accepts exactly what weekKey() produces", () => {
    expect(isWeekKey(WEEK)).toBe(true);
    expect(isWeekKey('2026-W01')).toBe(true);
    // 2026 has 53 ISO weeks; 2025 does not.
    expect(isWeekKey('2026-W53')).toBe(true);
    expect(isWeekKey('2025-W53')).toBe(false);
    for (const bad of ['2026-W00', '2026-W54', '2026-w39', '2026-39', 'W39', '2026-W9', '2026-W039', '', 'garbage']) {
      expect(isWeekKey(bad), bad).toBe(false);
    }
  });

  it('reads ?week= as asked, absent, or malformed', () => {
    expect(readWeekParam(new URLSearchParams('week=2026-W39'))).toBe('2026-W39');
    expect(readWeekParam(new URLSearchParams(''))).toBeNull();
    expect(readWeekParam(new URLSearchParams('week='))).toBeNull();
    expect(readWeekParam(new URLSearchParams('week=2026-39'))).toBe(false);
  });
});

describe('GET /api/widget/comments', () => {
  const KEY = generateWidgetKey();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    for (const mock of [updateMock, insertMock, deleteMock]) {
      mock.mockReset();
      mock.mockResolvedValue({});
    }
    failing.clear();
    for (const key of Object.keys(tables)) delete tables[key];
    Object.assign(tables, fixtures());
    tables.widget_keys = [base('w-me', { user_id: 'u-me', key_hash: hashWidgetKey(KEY), last_used_at: '' })];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const get = (query = '', token?: string) =>
    GET(
      new Request(`https://x.test/api/widget/comments${query}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );

  it('refuses a missing, wrong or revoked key, all the same way, as /api/widget does', async () => {
    const responses = [
      await get(`?week=${WEEK}`),
      await get(`?week=${WEEK}`, generateWidgetKey()),
      await get(`?week=${WEEK}&key=pmw_nope`),
    ];
    tables.widget_keys = [];
    responses.push(await get(`?week=${WEEK}`, KEY));

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it('refuses the key of somebody who has been deactivated', async () => {
    tables.widget_keys = [base('w-gone', { user_id: 'u-gone', key_hash: hashWidgetKey(KEY), last_used_at: '' })];
    expect((await get(`?week=${WEEK}`, KEY)).status).toBe(401);
  });

  it('checks the key before the week, so a caller without one learns nothing', async () => {
    expect((await get('?week=garbage')).status).toBe(401);
  });

  it('turns away a week that is not a week key', async () => {
    for (const bad of ['2026-39', '2026-W54', '2025-W53', '2026-w39', 'last']) {
      const res = await get(`?week=${encodeURIComponent(bad)}`, KEY);
      expect(res.status, bad).toBe(400);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'bad_week', expected: 'YYYY-Www' });
    }
  });

  it("answers with the week's comments, oldest first, uncached, in a fixed shape", async () => {
    const res = await get(`?week=${WEEK}`, KEY);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');

    const body = await res.json();
    expect(body.week).toBe(WEEK);
    expect(body.comments.map((c: { entity_id: string }) => c.entity_id)).toEqual([
      'm-cancelled',
      't-this',
      'k-linked',
      'k-picked',
      'm-this',
      'm-this',
    ]);
    expect(body.comments[0]).toEqual({
      entity_type: 'meetings',
      entity_id: 'm-cancelled',
      body: 'body of c-cancelled',
      author_name: 'Me',
      created_at: '2026-09-23T01:00:00.000Z',
    });
    for (const c of body.comments) {
      expect(Object.keys(c).sort()).toEqual(['author_name', 'body', 'created_at', 'entity_id', 'entity_type']);
    }
  });

  it('names authors as the app does, and leaves a removed account unnamed', async () => {
    const body = await (await get(`?week=${WEEK}`, KEY)).json();
    const byBody = new Map(body.comments.map((c: { body: string; author_name: string | null }) => [c.body, c.author_name]));
    expect(byBody.get('body of c-topic')).toBe('Prof');
    // Deactivated since: the app still shows their name on what they wrote.
    expect(byBody.get('body of c-picked')).toBe('Gone');
    expect(byBody.get('body of c-removed-author')).toBeNull();
  });

  it('leaves out other weeks, dropped topics and anything that is not a meeting, topic or task', async () => {
    const body = await (await get(`?week=${WEEK}`, KEY)).json();
    const bodies: string[] = body.comments.map((c: { body: string }) => c.body);
    for (const hidden of [
      'c-past-meeting',
      'c-past-task',
      'c-dropped',
      'c-behind-dropped',
      'c-other-topic',
      'c-unrelated-task',
      'c-feedback',
      'c-ghost',
    ]) {
      expect(bodies, hidden).not.toContain(`body of ${hidden}`);
    }
  });

  it("never carries an email, an author's id or who was mentioned", async () => {
    const text = await (await get(`?week=${WEEK}`, KEY)).text();
    expect(text).not.toContain('@lab.test');
    expect(text).not.toMatch(/"u-/);
    expect(text).not.toContain('mention');
  });

  it("serves another week when asked: last week's comments, and none of this week's", async () => {
    const body = await (await get('?week=2026-W38', KEY)).json();
    expect(body.week).toBe('2026-W38');
    expect(body.comments.map((c: { body: string }) => c.body).sort()).toEqual(
      ['body of c-other-topic', 'body of c-past-meeting', 'body of c-past-task'].sort(),
    );
  });

  it('defaults to the active week, the one /api/widget shows', async () => {
    const body = await (await get('', KEY)).json();
    expect(body.week).toBe(activeWeekKey(tables.meetings as never, NOW));
    expect(body.week).toBe(WEEK);

    // A full lab day after this week's meeting, the active week moves on.
    vi.setSystemTime(new Date('2026-09-26T05:00:00.000Z'));
    const later = await (await get('', KEY)).json();
    expect(later.week).toBe('2026-W40');
    expect(later.comments).toEqual([]);
  });

  it("writes nothing but the key's own day, once a day", async () => {
    await get(`?week=${WEEK}`, KEY);
    expect(insertMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [table, id, record] = updateMock.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect([table, id, Object.keys(record)]).toEqual(['widget_keys', 'w-me', ['last_used_at']]);

    updateMock.mockClear();
    (tables.widget_keys[0] as { last_used_at: string }).last_used_at = record.last_used_at as string;
    await get(`?week=${WEEK}`, KEY);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('says it is unavailable rather than "no comments" when a tab cannot be read', async () => {
    for (const table of ['comments', 'topics', 'tasks', 'meetings']) {
      failing.clear();
      failing.add(table);
      const res = await get(`?week=${WEEK}`, KEY);
      expect(res.status, table).toBe(503);
      expect(await res.json()).toEqual({ error: 'unavailable' });
    }
  });
});
