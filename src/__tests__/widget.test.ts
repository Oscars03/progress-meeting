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
const { GET: GET_IMAGE } = await import('../app/api/widget/image/route');
const { GET: GET_PAGE } = await import('../app/api/widget/page/route');
const { isBrowser } = await import('../lib/widget-request');
const { buildTiles } = await import('../lib/widget-tiles');
const { renderWidgetSvg, splitSaraAm, clip, widgetBackground, readWidgetSize } = await import('../lib/widget-svg');
const { woffToSfnt, svgToPng } = await import('../lib/widget-png');

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

  it('counts the days to the meeting in lab days, and every open task by urgency', () => {
    const summary = buildWidgetSummary(sources(), 'u-me', NOW);
    expect(summary.meeting?.daysAway).toBe(2);
    expect(summary.taskCounts).toEqual({ total: 4, overdue: 1, soon: 1, later: 1, none: 1 });
  });
});

describe('buildTiles', () => {
  const summaryFor = (userId: string) => buildWidgetSummary(sources(), userId, NOW);

  it('gives four tiles in a fixed order', () => {
    expect(buildTiles(summaryFor('u-me')).map((tile) => tile.key)).toEqual(['meeting', 'present', 'tasks', 'polls']);
  });

  it('turns the meeting into a countdown', () => {
    const [meeting] = buildTiles(summaryFor('u-me'));
    expect(meeting).toMatchObject({ value: 'อีก 2 วัน', tone: 'blue', quiet: false });
    expect(meeting.caption).toContain('13:30');

    const at = (daysAway: number) => {
      const summary = summaryFor('u-me');
      summary.meeting = { ...summary.meeting!, daysAway };
      return buildTiles(summary)[0].value;
    };
    expect(at(0)).toBe('วันนี้');
    expect(at(1)).toBe('พรุ่งนี้');
  });

  it("shows the reader's place in the order, with a dot for everyone", () => {
    const present = buildTiles(summaryFor('u-me'))[1];
    expect(present).toMatchObject({ value: '2/2', caption: 'My result', tone: 'violet', dots: { count: 2, mine: 2 } });
    expect(present.detail).toContain('2. Me (คุณ)');

    const notPresenting = buildTiles(summaryFor('u-prof'))[1];
    expect(notPresenting).toMatchObject({ value: '—', caption: '2 คนนำเสนอ', quiet: true, dots: { count: 2, mine: null } });
  });

  it('turns the task tile red only when something is overdue', () => {
    const tasks = buildTiles(summaryFor('u-me'))[2];
    expect(tasks).toMatchObject({ value: '4', caption: 'เลยกำหนด 1', tone: 'red', bar: { overdue: 1, soon: 1, later: 1, none: 1 } });

    const src = sources();
    src.tasks = src.tasks.filter((task) => task.id !== 'k-late');
    expect(buildTiles(buildWidgetSummary(src, 'u-me', NOW))[2]).toMatchObject({ tone: 'amber', caption: 'ใกล้ถึงกำหนด 1' });
  });

  it('quiets every tile when there is nothing, without calling that good news', () => {
    const empty = buildWidgetSummary({ users: sources().users, meetings: [], topics: [], tasks: [], polls: [], slots: [], votes: [] }, 'u-me', NOW);
    const tiles = buildTiles(empty);
    expect(tiles.every((tile) => tile.quiet && tile.tone === 'gray')).toBe(true);
    expect(tiles.map((tile) => tile.caption)).toEqual(['ยังไม่มีนัด', 'ยังไม่มีหัวข้อ', 'ไม่มีงานค้าง', 'ไม่มีโพลรอ']);
  });
});

describe('kwgtImageUrl', () => {
  it('carries the encoded key and both parts KWGT changes to refetch: the hour and the tap', async () => {
    const { kwgtImageUrl } = await import('../lib/widget-scripts');
    const url = kwgtImageUrl('https://app.test/', 'pmw_a+b/c', 'square', 'dark');
    expect(url.startsWith('https://app.test/api/widget/image?key=pmw_a%2Bb%2Fc&size=square&theme=dark')).toBe(true);
    expect(url).toContain('&t=$df(yyMMddHH)$');
    expect(url.endsWith('&r=$gv(refresh)$')).toBe(true);
  });

  it('has a page twin for AnyWidget, which refreshes by itself, without KWGT formulas', async () => {
    const { pageUrl } = await import('../lib/widget-scripts');
    const url = pageUrl('https://app.test/', 'pmw_a+b/c', 'wide', 'light');
    expect(url).toBe('https://app.test/api/widget/page?key=pmw_a%2Bb%2Fc&size=wide&theme=light');
    expect(url).not.toContain('$');
  });

  it('is still answered by the image route with the KWGT parts left unevaluated', async () => {
    const { kwgtImageUrl } = await import('../lib/widget-scripts');
    const KEY = generateWidgetKey();
    Object.assign(tables, fixtures());
    tables.widget_keys = [base('w-me', { user_id: 'u-me', key_hash: hashWidgetKey(KEY), last_used_at: '' })];
    const res = await GET_IMAGE(new Request(kwgtImageUrl('https://x.test', KEY, 'wide', 'light')));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
  }, 20_000);
});

describe('widget drawing', () => {
  it('splits sara am into its parts, ring ahead of any tone mark', () => {
    expect(splitSaraAm('น\u0E33')).toBe('น\u0E4Dา');
    expect(splitSaraAm('น\u0E49\u0E33')).toBe('น\u0E4D\u0E49า');
    expect(splitSaraAm('ท\u0E35\u0E48น\u0E35\u0E48')).toBe('ท\u0E35\u0E48น\u0E35\u0E48');
  });

  it('does not count Thai marks when cutting text to length', () => {
    expect(clip('ที่นี่', 4)).toBe('ที่นี่');
    expect(clip('abcdefgh', 4)).toBe('abcd…');
  });

  it('escapes text, so a title cannot inject markup into the picture', () => {
    const summary = buildWidgetSummary(sources(), 'u-me', NOW);
    summary.polls = [{ title: '<script>x</script> & "q"', remaining: 1 }];
    const svg = renderWidgetSvg(buildTiles(summary));
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('draws the wide and square canvases at their sizes', () => {
    const tiles = buildTiles(buildWidgetSummary(sources(), 'u-me', NOW));
    expect(renderWidgetSvg(tiles, { size: 'wide' })).toContain('width="1000" height="470"');
    expect(renderWidgetSvg(tiles, { size: 'square', theme: 'dark' })).toContain('width="1000" height="1000"');
  });

  it('unpacks the WOFF font into a font resvg can read', async () => {
    const { readFile } = await import('node:fs/promises');
    const woff = await readFile('node_modules/@ibm/plex-sans-thai/fonts/complete/woff/IBMPlexSansThai-Regular.woff');
    const sfnt = woffToSfnt(woff);
    expect(sfnt.readUInt32BE(0)).toBe(woff.readUInt32BE(4));
    expect(sfnt.readUInt16BE(4)).toBe(woff.readUInt16BE(12));
    expect(() => woffToSfnt(Buffer.from('not a font'))).toThrow();
  });

  it('renders a PNG', async () => {
    const png = await svgToPng(renderWidgetSvg(buildTiles(buildWidgetSummary(sources(), 'u-me', NOW))));
    expect(Buffer.from(png.subarray(0, 8)).toString('hex')).toBe('89504e470d0a1a0a');
  }, 20_000);
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

  it('carries the four tiles for the iPhone widget to draw', async () => {
    const body = await (await get('https://x.test/api/widget', KEY)).json();
    expect(body.tiles.map((tile: { key: string }) => tile.key)).toEqual(['meeting', 'present', 'tasks', 'polls']);
  });
});

describe('GET /api/widget/image', () => {
  const KEY = generateWidgetKey();

  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockResolvedValue({});
    Object.assign(tables, fixtures());
    tables.widget_keys = [base('w-me', { user_id: 'u-me', key_hash: hashWidgetKey(KEY), last_used_at: '' })];
  });

  it('refuses a wrong key the same way the JSON endpoint does', async () => {
    const res = await GET_IMAGE(new Request('https://x.test/api/widget/image?key=pmw_nope'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('answers the key in ?key= with an uncached PNG', async () => {
    const res = await GET_IMAGE(new Request(`https://x.test/api/widget/image?key=${encodeURIComponent(KEY)}&size=square&theme=dark`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4).toString('hex')).toBe('89504e47');
    // PNG IHDR: width and height at bytes 16-23.
    expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([1000, 1000]);
  }, 20_000);
});

// AnyWidget frames the top of a page. Handed the bare PNG, the browser
// centred it on black and the widget showed mostly black.
describe('GET /api/widget/page', () => {
  const KEY = generateWidgetKey();

  beforeEach(() => {
    updateMock.mockReset();
    updateMock.mockResolvedValue({});
    Object.assign(tables, fixtures());
    tables.widget_keys = [base('w-me', { user_id: 'u-me', key_hash: hashWidgetKey(KEY), last_used_at: '' })];
  });

  it('is the picture alone, flush to the top, on the picture’s own background', async () => {
    const res = await GET_PAGE(new Request(`https://x.test/api/widget/page?key=${encodeURIComponent(KEY)}&theme=dark`));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('<meta name="viewport" content="width=device-width,initial-scale=1">');
    expect(html).toContain('margin:0');
    expect(html).toContain(`background:${widgetBackground('dark')}`);
    expect(html).toMatch(/<body><a href="\/dashboard"><img alt="" src="data:image\/png;base64,[A-Za-z0-9+/=]+"><\/a><\/body>/);
  }, 20_000);

  // The widget is the only place this is read, so the refusal is words.
  // The owner's AnyWidget frame was about 1.57:1; 2:1 left a dark band in it.
  it('draws the 3×2 size just inside AnyWidget’s frame', async () => {
    const res = await GET_IMAGE(new Request(`https://x.test/api/widget/image?key=${encodeURIComponent(KEY)}&size=mid`));
    const bytes = Buffer.from(await res.arrayBuffer());
    const [width, height] = [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    expect([width, height]).toEqual([1000, 630]);
    expect(width / height).toBeGreaterThan(1.57);
  }, 20_000);

  // A tap on the widget opens the same address in the browser; that should
  // land in the app, while the WebView drawing the widget still gets the tiles.
  const CHROME = 'Mozilla/5.0 (Linux; Android 14; V2250) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
  const WEBVIEW = 'Mozilla/5.0 (Linux; Android 14; V2250; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/128.0.0.0 Mobile Safari/537.36';

  it('sends a browser on to the dashboard', async () => {
    const res = await GET_PAGE(
      new Request(`https://x.test/api/widget/page?key=${encodeURIComponent(KEY)}`, { headers: { 'user-agent': CHROME } })
    );
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('https://x.test/dashboard');
  });

  it('draws the picture for the WebView the widget app uses, as a link to the dashboard', async () => {
    const res = await GET_PAGE(
      new Request(`https://x.test/api/widget/page?key=${encodeURIComponent(KEY)}`, { headers: { 'user-agent': WEBVIEW } })
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/<a href="\/dashboard"><img alt="" src="data:image\/png;base64,/);
  }, 20_000);

  it('treats a caller that is no browser as the widget', () => {
    expect(isBrowser(null)).toBe(false);
    expect(isBrowser('okhttp/4.12.0')).toBe(false);
    expect(isBrowser(WEBVIEW)).toBe(false);
    expect(isBrowser(CHROME)).toBe(true);
  });

  it('reads an unknown size as the wide default', () => {
    expect(readWidgetSize('mid')).toBe('mid');
    expect(readWidgetSize('square')).toBe('square');
    expect(readWidgetSize('huge')).toBe('wide');
    expect(readWidgetSize(null)).toBe('wide');
  });

  it('says a refused key is dead, as a page, with the refusal’s status', async () => {
    const res = await GET_PAGE(new Request('https://x.test/api/widget/page?key=pmw_nope'));
    expect(res.status).toBe(401);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await res.text()).toContain('คีย์วิดเจ็ตนี้ใช้ไม่ได้แล้ว');
  });
});
