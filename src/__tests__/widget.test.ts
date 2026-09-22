/**
 * The phone widget: its keys, the summary it shows, and the endpoint that
 * serves it.
 *
 * The endpoint is reachable from the public internet with nothing but a key,
 * so the first things proven are that every kind of wrong key is refused the
 * same way, that a deactivated account's key stops working, and that the
 * summary carries nobody's email address.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { weekKey } from '../lib/week';

const tables: Record<string, unknown[]> = {};
const updateMock = vi.fn(async () => ({}));

vi.mock('../lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: async (table: string) => structuredClone(tables[table] ?? []),
    update: (...args: unknown[]) => updateMock(...(args as [])),
  },
}));

const { generateWidgetKey, hashWidgetKey, widgetKeyMatches, widgetKeyFrom, WIDGET_KEY_PREFIX } = await import(
  '../lib/widget-key'
);
const { buildWidgetSummary } = await import('../lib/widget-summary');
const { GET } = await import('../app/api/widget/route');

// Tuesday 22 Sep 2026, 12:00 in the lab (UTC+7).
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

function fixtures() {
  return {
    users: [
      base('u-me', { name: 'Me', email: 'me@lab.test', role: 'student', active: true }),
      base('u-ann', { name: 'Ann', email: 'ann@lab.test', role: 'student', active: true }),
      base('u-prof', { name: 'Prof', email: 'prof@lab.test', role: 'professor', active: true }),
      base('u-admin', { name: 'Admin', email: 'admin@lab.test', role: 'admin', active: true }),
      base('u-gone', { name: 'Gone', email: 'gone@lab.test', role: 'student', active: false }),
    ],
    meetings: [
      base('m-past', { title: 'Last week', start_at: '2026-09-15T06:30:00.000Z', end_at: '2026-09-15T08:00:00.000Z', status: 'scheduled', location: '' }),
      base('m-cancelled', { title: 'Called off', start_at: '2026-09-23T06:30:00.000Z', end_at: '2026-09-23T08:00:00.000Z', status: 'cancelled', location: '' }),
      base('m-next', { title: 'Progress meeting', start_at: '2026-09-24T06:30:00.000Z', end_at: '2026-09-24T08:00:00.000Z', status: 'scheduled', location: 'Room 401' }),
      base('m-later', { title: 'After that', start_at: '2026-10-01T06:30:00.000Z', end_at: '2026-10-01T08:00:00.000Z', status: 'scheduled', location: '' }),
    ],
    topics: [
      // Ann brought two, I brought one: "most topics first" puts Ann ahead.
      base('t-1', { title: 'My result', owner_id: 'u-me', week_key: WEEK, present_order: '', status: 'submitted', created_at: '2026-09-20T00:00:00.000Z' }),
      base('t-2', { title: 'Ann A', owner_id: 'u-ann', week_key: WEEK, present_order: '', status: 'submitted', created_at: '2026-09-21T00:00:00.000Z' }),
      base('t-3', { title: 'Ann B', owner_id: 'u-ann', week_key: WEEK, present_order: '', status: 'submitted', created_at: '2026-09-21T01:00:00.000Z' }),
      base('t-dropped', { title: 'Withdrawn', owner_id: 'u-me', week_key: WEEK, present_order: '', status: 'dropped' }),
      base('t-old', { title: 'Old week', owner_id: 'u-me', week_key: '2026-W01', present_order: '', status: 'submitted' }),
    ],
    tasks: [
      base('k-later', { title: 'Later', assignee_ids: ['u-me'], due_date: '2026-10-30', status: 'todo' }),
      base('k-none', { title: 'Someday', assignee_ids: ['u-me'], due_date: '', status: 'todo' }),
      base('k-late', { title: 'Late', assignee_ids: ['u-me'], due_date: '2026-09-20', status: 'in_progress' }),
      base('k-soon', { title: 'Soon', assignee_ids: 'u-me', due_date: '2026-09-25', status: 'todo' }),
      base('k-done', { title: 'Finished', assignee_ids: ['u-me'], due_date: '2026-09-21', status: 'done' }),
      base('k-ann', { title: 'Not mine', assignee_ids: ['u-ann'], due_date: '2026-09-23', status: 'todo' }),
    ],
    availability_polls: [
      base('p-open', { title: 'Next week time', status: 'open', created_at: '2026-09-21T00:00:00.000Z' }),
      base('p-answered', { title: 'Already answered', status: 'open', created_at: '2026-09-20T00:00:00.000Z' }),
      base('p-closed', { title: 'Closed', status: 'closed', created_at: '2026-09-19T00:00:00.000Z' }),
    ],
    availability_slots: [
      base('s-1', { poll_id: 'p-open' }),
      base('s-2', { poll_id: 'p-open' }),
      base('s-3', { poll_id: 'p-answered' }),
      base('s-4', { poll_id: 'p-closed' }),
    ],
    availability_votes: [
      base('v-1', { slot_id: 's-1', user_id: 'u-me', choice: 'yes' }),
      base('v-2', { slot_id: 's-3', user_id: 'u-me', choice: 'no' }),
    ],
  };
}

function sources() {
  const f = fixtures();
  return {
    users: f.users,
    meetings: f.meetings,
    topics: f.topics,
    tasks: f.tasks,
    polls: f.availability_polls,
    slots: f.availability_slots,
    votes: f.availability_votes,
  } as unknown as Parameters<typeof buildWidgetSummary>[0];
}

describe('widget keys', () => {
  it('are long, prefixed and never repeat', () => {
    const a = generateWidgetKey();
    const b = generateWidgetKey();
    expect(a.startsWith(WIDGET_KEY_PREFIX)).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(WIDGET_KEY_PREFIX.length + 43);
    expect(a).not.toBe(b);
  });

  it('match their own hash and nothing else', () => {
    const key = generateWidgetKey();
    const hash = hashWidgetKey(key);
    expect(hash).not.toContain(key);
    expect(widgetKeyMatches(key, hash)).toBe(true);
    expect(widgetKeyMatches(generateWidgetKey(), hash)).toBe(false);
    expect(widgetKeyMatches(key, '')).toBe(false);
    expect(widgetKeyMatches(key, 'not-hex')).toBe(false);
  });

  it('are read from the Authorization header before the query string', () => {
    const req = new Request('https://x.test/api/widget?key=from-query', { headers: { authorization: 'Bearer from-header' } });
    expect(widgetKeyFrom(req)).toBe('from-header');
    expect(widgetKeyFrom(new Request('https://x.test/api/widget?key=from-query'))).toBe('from-query');
    expect(widgetKeyFrom(new Request('https://x.test/api/widget'))).toBeNull();
    expect(widgetKeyFrom(new Request('https://x.test/api/widget?key=%20'))).toBeNull();
  });
});

describe('buildWidgetSummary', () => {
  it('shows the next meeting that is not cancelled, in lab time', () => {
    const summary = buildWidgetSummary(sources(), 'u-me', NOW);
    expect(summary.meeting).toMatchObject({ title: 'Progress meeting', startAt: '2026-09-24T06:30:00.000Z', location: 'Room 401' });
    expect(summary.meeting?.time).toBe('13:30–15:00');
    expect(summary.meeting?.when).toContain('13:30');
  });

  it("gives this week's running order, most topics first, with the reader marked", () => {
    const summary = buildWidgetSummary(sources(), 'u-me', NOW);
    expect(summary.presentations).toEqual([
      { position: 1, name: 'Ann', topics: ['Ann A', 'Ann B'], isMe: false },
      { position: 2, name: 'Me', topics: ['My result'], isMe: true },
    ]);
    expect(summary.myPosition).toBe(2);
    expect(summary.text.presentations).toBe('1. Ann — Ann A, Ann B\n▶ 2. Me — My result');
  });

  it('leaves myPosition empty for somebody not presenting', () => {
    expect(buildWidgetSummary(sources(), 'u-prof', NOW).myPosition).toBeNull();
  });

  it('lists only open tasks assigned to the reader, dated soonest first, undated last', () => {
    const summary = buildWidgetSummary(sources(), 'u-me', NOW);
    expect(summary.tasks.map((task) => [task.title, task.due])).toEqual([
      ['Late', 'overdue'],
      ['Soon', 'soon'],
      ['Later', 'later'],
      ['Someday', 'none'],
    ]);
  });

  it('caps the task list at five', () => {
    const src = sources();
    src.tasks = Array.from({ length: 8 }, (_, i) =>
      base(`k-${i}`, { title: `T${i}`, assignee_ids: ['u-me'], due_date: `2026-10-0${i + 1}`, status: 'todo' }),
    ) as unknown as typeof src.tasks;
    expect(buildWidgetSummary(src, 'u-me', NOW).tasks).toHaveLength(5);
  });

  it('lists open polls with slots still unanswered, and only for members', () => {
    expect(buildWidgetSummary(sources(), 'u-me', NOW).polls).toEqual([{ title: 'Next week time', remaining: 1 }]);
    // Admin and professors are not chased for answers anywhere else either.
    expect(buildWidgetSummary(sources(), 'u-admin', NOW).polls).toEqual([]);
    expect(buildWidgetSummary(sources(), 'u-prof', NOW).polls).toEqual([]);
  });

  it('says plainly when there is nothing, rather than an empty string', () => {
    const empty = { users: sources().users, meetings: [], topics: [], tasks: [], polls: [], slots: [], votes: [] };
    const summary = buildWidgetSummary(empty, 'u-me', NOW);
    expect(summary.meeting).toBeNull();
    expect(summary.text).toEqual({
      meeting: 'ยังไม่มีนัดประชุม',
      presentations: 'ยังไม่มีหัวข้อนำเสนอสัปดาห์นี้',
      tasks: 'ไม่มีงานค้าง',
      polls: 'ไม่มีโพลที่รอคุณตอบ',
    });
  });

  it("never carries anybody's email address", () => {
    const json = JSON.stringify(buildWidgetSummary(sources(), 'u-me', NOW));
    expect(json).not.toMatch(/@lab\.test/);
  });
});

describe('GET /api/widget', () => {
  const KEY = generateWidgetKey();

  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockResolvedValue({});
    Object.assign(tables, fixtures());
    tables.widget_keys = [
      base('w-me', { user_id: 'u-me', key_hash: hashWidgetKey(KEY), last_used_at: '' }),
    ];
  });

  const get = (url: string, token?: string) =>
    GET(new Request(url, { headers: token ? { authorization: `Bearer ${token}` } : {} }));

  it('refuses a missing, wrong or revoked key, all the same way', async () => {
    const responses = [
      await get('https://x.test/api/widget'),
      await get('https://x.test/api/widget', generateWidgetKey()),
      await get('https://x.test/api/widget?key=pmw_nope'),
    ];
    tables.widget_keys = [];
    responses.push(await get('https://x.test/api/widget', KEY));

    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
  });

  it("refuses the key of somebody who has been deactivated", async () => {
    tables.widget_keys = [base('w-gone', { user_id: 'u-gone', key_hash: hashWidgetKey(KEY), last_used_at: '' })];
    expect((await get('https://x.test/api/widget', KEY)).status).toBe(401);
  });

  it('serves the summary for the key in the header, uncached', async () => {
    const res = await get('https://x.test/api/widget', KEY);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const body = await res.json();
    expect(body).toHaveProperty('meeting');
    expect(body).toHaveProperty('text.presentations');
  });

  it('serves it for the key in ?key= too, for Android', async () => {
    const res = await get(`https://x.test/api/widget?key=${encodeURIComponent(KEY)}`);
    expect(res.status).toBe(200);
  });

  it('records the day it was used, once a day, as the key owner', async () => {
    await get('https://x.test/api/widget', KEY);
    expect(updateMock).toHaveBeenCalledTimes(1);
    const [table, id, record, version, actor] = updateMock.mock.calls[0] as unknown as [string, string, { last_used_at: string }, number, string];
    expect([table, id, version, actor]).toEqual(['widget_keys', 'w-me', 1, 'u-me']);
    expect(record.last_used_at).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Already stamped today: no second write, so no second audit row.
    updateMock.mockClear();
    (tables.widget_keys[0] as { last_used_at: string }).last_used_at = record.last_used_at;
    await get('https://x.test/api/widget', KEY);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('still answers when recording the day fails', async () => {
    updateMock.mockRejectedValue(new Error('version conflict'));
    expect((await get('https://x.test/api/widget', KEY)).status).toBe(200);
  });
});
