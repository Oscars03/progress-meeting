/**
 * Sub-projects as the tracker draws them, and as other pages name them: which
 * rows hang under which, who may add one, and how a sub-project's title reads
 * away from the board.
 */

import { describe, it, expect } from 'vitest';
import { toRows } from '../app/(app)/tasks/tracker-model';
import { taskTitles } from '../lib/task-title';
import type { SessionUser } from '../lib/auth-guard';
import type { TaskRecord } from '../lib/db/schema';

const TODAY = '2026-10-21';

function actor(id: string, role: SessionUser['role']): SessionUser {
  return { id, role, realRole: role, abilities: {}, previewing: false, previewingLead: false };
}

function task(over: Partial<TaskRecord>): TaskRecord {
  return {
    id: 'x',
    row_version: 1,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '',
    created_by: '',
    title: 'x',
    details: '',
    owner_id: '',
    assignee_ids: [],
    due_date: '2026-11-30',
    priority: 'medium',
    progress_pct: 0,
    status: 'not_started',
    overdue_flag: false,
    category: '',
    project: '',
    meeting_id: '',
    links: [],
    assigner_id: '',
    round_id: '',
    start_date: '2026-10-01',
    subtasks: [],
    progress_at: '',
    parent_id: '',
    ...over,
  } as TaskRecord;
}

const tasks = [
  task({ id: 'thesis', title: 'Thesis', assignee_ids: ['ann'] }),
  task({ id: 'ch2', title: 'Chapter 2', assignee_ids: ['ann', 'bob'], parent_id: 'thesis' }),
  // Its parent was deleted by hand in the sheet.
  task({ id: 'orphan', title: 'Orphan', parent_id: 'gone' }),
  // A sub-project of a sub-project, written by hand: the app never makes one.
  task({ id: 'deep', title: 'Section 1', parent_id: 'ch2' }),
];

function rowsFor(who: SessionUser) {
  return toRows({ actor: who, tasks, rounds: [], updates: [], leads: [], thisWeek: '2026-W43', today: TODAY });
}

describe('sub-projects on the board', () => {
  it('does not call work quiet that was only made today, but does once eight days pass unheard', () => {
    const fresh = task({ id: 'new', title: 'New', created_at: `${TODAY}T03:00:00.000Z`, start_date: '', due_date: '' });
    const old = task({ id: 'old', title: 'Old', created_at: '2026-10-01T03:00:00.000Z', start_date: '', due_date: '' });
    const rows = toRows({ actor: actor('prof', 'professor'), tasks: [fresh, old], rounds: [], updates: [], leads: [], thisWeek: '2026-W43', today: TODAY });
    expect(rows.find((r) => r.id === 'new')?.health).toBe('ok');
    expect(rows.find((r) => r.id === 'new')?.lastUpdate).toBeNull();
    expect(rows.find((r) => r.id === 'old')?.health).toBe('stale');
  });

  it('hangs a sub-project under its project, and stands a stray one on its own', () => {
    const byId = new Map(rowsFor(actor('prof', 'professor')).map((r) => [r.id, r]));
    expect(byId.get('ch2')?.parentId).toBe('thesis');
    expect(byId.get('thesis')?.parentId).toBe('');
    // Neither disappears from the board: they show as projects of their own.
    expect(byId.get('orphan')?.parentId).toBe('');
    expect(byId.get('deep')?.parentId).toBe('');
  });

  it('offers to break up a project, never a sub-project, and to a student only their own', () => {
    const prof = new Map(rowsFor(actor('prof', 'professor')).map((r) => [r.id, r.can.addSub]));
    expect(prof.get('thesis')).toBe(true);
    expect(prof.get('ch2')).toBe(false);
    expect(prof.get('deep')).toBe(false);

    const ann = new Map(rowsFor(actor('ann', 'student')).map((r) => [r.id, r.can.addSub]));
    const cat = new Map(rowsFor(actor('cat', 'student')).map((r) => [r.id, r.can.addSub]));
    expect(ann.get('thesis')).toBe(true);
    expect(cat.get('thesis')).toBe(false);
  });
});

describe('a sub-project named away from the board', () => {
  it('carries its project’s name in front, and only when that project is there', () => {
    const titleOf = taskTitles(tasks);
    expect(titleOf(tasks[1])).toBe('Thesis › Chapter 2');
    expect(titleOf(tasks[0])).toBe('Thesis');
    expect(titleOf(tasks[2])).toBe('Orphan');
  });
});
