import type { WidgetSummary } from './widget-summary';

/**
 * The widget as four equal tiles -- meeting, presentation, tasks, polls --
 * each one big value and one line under it.
 *
 * Decided once, here, and drawn three ways: the PNG for Android
 * (widget-svg.ts), the native Scriptable widget on iPhone (which receives these
 * in the JSON), and the preview in Settings. So the three cannot tell a person
 * different things.
 */
export type TileTone = 'blue' | 'violet' | 'amber' | 'red' | 'teal' | 'gray';

export type Tile = {
  key: 'meeting' | 'present' | 'tasks' | 'polls';
  label: string;
  /** The one thing to read at a glance: "พรุ่งนี้", "2/3", "4". */
  value: string;
  caption: string;
  tone: TileTone;
  /** Nothing to show -- drawn quieter, so a full tile stands out beside it. */
  quiet: boolean;
  /** Presentation tile: one dot per presenter, the reader's filled. */
  dots?: { count: number; mine: number | null };
  /** Task tile: a bar split by how urgent each open task is. */
  bar?: { overdue: number; soon: number; later: number; none: number };
  /** Extra lines the square Android image and the large iPhone widget have room for. */
  detail: string[];
};

function meetingTile(summary: WidgetSummary): Tile {
  const meeting = summary.meeting;
  if (!meeting) {
    return { key: 'meeting', label: 'ประชุม', value: '—', caption: 'ยังไม่มีนัด', tone: 'gray', quiet: true, detail: [] };
  }
  const days = meeting.daysAway;
  const value = days <= 0 ? 'วันนี้' : days === 1 ? 'พรุ่งนี้' : `อีก ${days} วัน`;
  return {
    key: 'meeting',
    label: 'ประชุม',
    value,
    caption: meeting.when,
    tone: 'blue',
    quiet: false,
    detail: [meeting.time, meeting.location].filter(Boolean),
  };
}

function presentTile(summary: WidgetSummary): Tile {
  const rows = summary.presentations;
  const mine = rows.find((row) => row.isMe);
  const dots = { count: rows.length, mine: mine ? mine.position : null };
  // "(คุณ)" rather than a ▶: the image's font has no arrow glyph to draw.
  const detail = rows.slice(0, 4).map((row) => `${row.position}. ${row.name}${row.isMe ? ' (คุณ)' : ''}`);

  if (mine) {
    return {
      key: 'present',
      label: 'คิวนำเสนอ',
      value: `${mine.position}/${rows.length}`,
      caption: mine.topics.join(', '),
      tone: 'violet',
      quiet: false,
      dots,
      detail,
    };
  }
  return {
    key: 'present',
    label: 'คิวนำเสนอ',
    value: '—',
    caption: rows.length ? `${rows.length} คนนำเสนอ` : 'ยังไม่มีหัวข้อ',
    tone: 'gray',
    quiet: true,
    dots,
    detail,
  };
}

function tasksTile(summary: WidgetSummary): Tile {
  const counts = summary.taskCounts;
  const bar = { overdue: counts.overdue, soon: counts.soon, later: counts.later, none: counts.none };
  const detail = summary.tasks.slice(0, 3).map((task) => task.title);

  if (counts.total === 0) {
    return { key: 'tasks', label: 'งานของฉัน', value: '0', caption: 'ไม่มีงานค้าง', tone: 'gray', quiet: true, bar, detail };
  }
  const caption =
    counts.overdue > 0
      ? `เลยกำหนด ${counts.overdue}`
      : counts.soon > 0
        ? `ใกล้ถึงกำหนด ${counts.soon}`
        : 'ยังไม่ถึงกำหนด';
  return {
    key: 'tasks',
    label: 'งานของฉัน',
    value: String(counts.total),
    caption,
    // Each tile keeps its own colour; red is saved for the one thing that is late.
    tone: counts.overdue > 0 ? 'red' : 'amber',
    quiet: false,
    bar,
    detail,
  };
}

function pollsTile(summary: WidgetSummary): Tile {
  const polls = summary.polls;
  if (polls.length === 0) {
    return { key: 'polls', label: 'โพลรอตอบ', value: '0', caption: 'ไม่มีโพลรอ', tone: 'gray', quiet: true, detail: [] };
  }
  return {
    key: 'polls',
    label: 'โพลรอตอบ',
    value: String(polls.length),
    caption: polls[0].title,
    tone: 'teal',
    quiet: false,
    // The first is the caption already; the rest follow it.
    detail: polls.slice(1, 4).map((poll) => poll.title),
  };
}

export function buildTiles(summary: WidgetSummary): Tile[] {
  return [meetingTile(summary), presentTile(summary), tasksTile(summary), pollsTile(summary)];
}
