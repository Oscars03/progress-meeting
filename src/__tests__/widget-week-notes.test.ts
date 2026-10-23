/**
 * /api/widget/week-notes: one week's minutes and progress reports for whoever
 * holds a widget key.
 *
 * Reachable from the public internet with nothing but that key, so the first
 * things proven are that it refuses keys exactly as /api/widget does, that a
 * malformed week is turned away, that nothing comes back the app itself would
 * not show the key's owner, and that it writes nothing but the key's own day.
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
const { isWeekKey, readWeekParam } = await import('../lib/widget-week-notes');
const { activeWeekKey } = await import('../lib/rotation');
const { GET } = await import('../app/api/widget/week-notes/route');

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

const report = (id: string, task_id: string, week_key: string, updated_by: string, extra: Record<string, unknown> = {}) =>
  base(id, {
    task_id,
    week_key,
    progress_pct: 40,
    summary: `summary of ${id}`,
    risks: `risks of ${id}`,
    next_plan: `plan of ${id}`,
    updated_by,
    updated_at: '2026-09-21T10:00:00.000Z',
    ...extra,
  });

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
      base('m-empty', { title: 'Nothing written', start_at: '2026-09-25T06:30:00.000Z', end_at: '2026-09-25T08:00:00.000Z', status: 'scheduled' }),
      base('m-later', { title: 'Next week', start_at: '2026-10-01T06:30:00.000Z', end_at: '2026-10-01T08:00:00.000Z', status: 'scheduled' }),
    ],
    minutes: [
      base('min-this', { meeting_id: 'm-this', content: 'We agreed on chapter 3.', recorded_by: 'u-ann', created_at: '2026-09-24T09:00:00.000Z', updated_at: '2026-09-24T09:30:00.000Z' }),
      // A second row for the same meeting: the page shows only the first.
      base('min-duplicate', { meeting_id: 'm-this', content: 'A hand-edited second record', recorded_by: 'u-ann' }),
      base('min-cancelled', { meeting_id: 'm-cancelled', content: 'Why it was called off', recorded_by: 'u-deleted', created_at: '2026-09-23T01:00:00.000Z', updated_at: '2026-09-23T01:00:00.000Z' }),
      base('min-empty', { meeting_id: 'm-empty', content: '   ', recorded_by: 'u-ann' }),
      base('min-past', { meeting_id: 'm-past', content: 'Last week we said', recorded_by: 'u-me' }),
      base('min-later', { meeting_id: 'm-later', content: 'Not yet', recorded_by: 'u-me' }),
      base('min-ghost', { meeting_id: 'm-ghost', content: 'Of a meeting since deleted', recorded_by: 'u-me' }),
    ],
    tasks: [
      base('k-thesis', { title: 'Thesis', status: 'in_progress', parent_id: '', assignee_ids: ['u-me'] }),
      base('k-chapter', { title: 'Chapter 2', status: 'todo', parent_id: 'k-thesis', assignee_ids: ['u-ann'] }),
      base('k-done', { title: 'Finished', status: 'done', parent_id: '', assignee_ids: ['u-ann'] }),
      base('k-other', { title: 'Other', status: 'todo', parent_id: '', assignee_ids: ['u-ann'] }),
    ],
    task_updates: [
      report('up-thesis-39', 'k-thesis', WEEK, 'u-me', { progress_pct: '45' }),
      report('up-chapter-39', 'k-chapter', WEEK, 'u-gone'),
      report('up-done-39', 'k-done', WEEK, 'u-ann'),
      // Written before updated_by was kept: falls back to created_by.
      report('up-other-39', 'k-other', WEEK, '', { created_by: 'u-deleted' }),
      report('up-ghost-39', 'k-ghost', WEEK, 'u-me'),
      // k-thesis has five weeks of reports; the tracker shows the newest three.
      report('up-thesis-38', 'k-thesis', '2026-W38', 'u-me'),
      report('up-thesis-37', 'k-thesis', '2026-W37', 'u-me'),
      report('up-thesis-36', 'k-thesis', '2026-W36', 'u-me'),
      report('up-thesis-35', 'k-thesis', '2026-W35', 'u-me'),
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

describe('GET /api/widget/week-notes', () => {
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
      new Request(`https://x.test/api/widget/week-notes${query}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    );

  const notes = async (query: string) => (await get(query, KEY)).json();

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

  it('answers uncached, in a fixed shape', async () => {
    const res = await get(`?week=${WEEK}`, KEY);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');

    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['minutes', 'task_updates', 'week']);
    expect(body.week).toBe(WEEK);
    expect(body.minutes.find((m: { meeting_id: string }) => m.meeting_id === 'm-this')).toEqual({
      meeting_id: 'm-this',
      meeting_title: 'Progress meeting',
      meeting_start_at: '2026-09-24T06:30:00.000Z',
      content: 'We agreed on chapter 3.',
      recorded_by_name: 'Ann',
      created_at: '2026-09-24T09:00:00.000Z',
      updated_at: '2026-09-24T09:30:00.000Z',
    });
    expect(body.task_updates.find((u: { task_id: string }) => u.task_id === 'k-thesis')).toEqual({
      task_id: 'k-thesis',
      task_title: 'Thesis',
      week_key: WEEK,
      progress_pct: 45,
      summary: 'summary of up-thesis-39',
      risks: 'risks of up-thesis-39',
      next_plan: 'plan of up-thesis-39',
      author_name: 'Me',
      updated_at: '2026-09-21T10:00:00.000Z',
    });
  });

  it("gives the week's minutes as the meeting page shows them: one record per meeting, earliest meeting first", async () => {
    const body = await notes(`?week=${WEEK}`);
    expect(body.minutes.map((m: { content: string }) => m.content)).toEqual([
      // Cancelled, but its page still opens with the minutes on it.
      'Why it was called off',
      'We agreed on chapter 3.',
    ]);
    // Left out: the duplicate the page never shows, an empty record, other
    // weeks' meetings, and minutes of a meeting that no longer exists.
    expect(body.minutes[0].recorded_by_name).toBeNull();
  });

  it("gives the week's reports in full, for open and done work alike", async () => {
    const body = await notes(`?week=${WEEK}`);
    const byTask = new Map(body.task_updates.map((u: { task_id: string }) => [u.task_id, u]));
    expect([...byTask.keys()]).toEqual(['k-done', 'k-other', 'k-thesis', 'k-chapter']);

    expect(byTask.get('k-chapter')).toMatchObject({ task_title: 'Thesis › Chapter 2', author_name: 'Gone', risks: 'risks of up-chapter-39' });
    expect(byTask.get('k-other')).toMatchObject({ author_name: null, next_plan: 'plan of up-other-39' });
    // Off the weekly page once done, but the debrief still wants what was said.
    expect(byTask.get('k-done')).toMatchObject({
      summary: 'summary of up-done-39',
      risks: 'risks of up-done-39',
      next_plan: 'plan of up-done-39',
    });
    // A report on work since deleted is shown nowhere.
    expect(byTask.has('k-ghost')).toBe(false);
  });

  it("gives a past week's reports in full too, the debrief often runs the week after", async () => {
    const last = await notes('?week=2026-W38');
    expect(last.minutes.map((m: { content: string }) => m.content)).toEqual(['Last week we said']);
    expect(last.task_updates).toEqual([
      expect.objectContaining({
        task_id: 'k-thesis',
        summary: 'summary of up-thesis-38',
        risks: 'risks of up-thesis-38',
        next_plan: 'plan of up-thesis-38',
      }),
    ]);

    // The tracker shows only a task's newest three (W39, W38, W37); the week
    // asked for comes back regardless.
    for (const week of ['2026-W37', '2026-W36', '2026-W35']) {
      const body = await notes(`?week=${week}`);
      expect(body.task_updates.map((u: { week_key: string; risks: string }) => [u.week_key, u.risks]), week).toEqual([
        [week, `risks of up-thesis-${week.slice(-2)}`],
      ]);
    }
    expect((await notes('?week=2026-W34')).task_updates).toEqual([]);
  });

  it("never carries an email or anybody's id, only names", async () => {
    const text = await (await get(`?week=${WEEK}`, KEY)).text();
    expect(text).not.toContain('@lab.test');
    expect(text).not.toMatch(/"u-/);
    expect(text).not.toContain('recorded_by"');
    expect(text).not.toContain('updated_by');
  });

  it('defaults to the active week, the one /api/widget shows', async () => {
    const body = await notes('');
    expect(body.week).toBe(activeWeekKey(tables.meetings as never, NOW));
    expect(body.week).toBe(WEEK);

    // A full lab day after this week's last meeting, the active week moves on.
    vi.setSystemTime(new Date('2026-09-27T05:00:00.000Z'));
    const later = await notes('');
    expect(later.week).toBe('2026-W40');
    expect(later.minutes.map((m: { content: string }) => m.content)).toEqual(['Not yet']);
    expect(later.task_updates).toEqual([]);
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

  it('says it is unavailable rather than "nothing written" when a tab cannot be read', async () => {
    for (const table of ['meetings', 'minutes', 'tasks', 'task_updates']) {
      failing.clear();
      failing.add(table);
      const res = await get(`?week=${WEEK}`, KEY);
      expect(res.status, table).toBe(503);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(await res.json()).toEqual({ error: 'unavailable' });
    }
  });
});
