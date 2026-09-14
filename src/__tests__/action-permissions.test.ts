/**
 * Who is allowed to do what, tested through the actions themselves.
 *
 * A server action is reachable by anyone who holds its id, so the button that
 * is or is not rendered decides nothing -- the check inside the action does.
 * Until now those checks were only ever exercised by clicking around in a
 * browser as one user, which cannot show what a *different* user is refused.
 *
 * The sheet and the session are mocked, so these are about the rule and not
 * about storage: the assertion is always either "the write happened" or "the
 * write did not happen and the reason was reported".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getServerSessionMock = vi.fn();
vi.mock('next-auth', () => ({ getServerSession: () => getServerSessionMock() }));
vi.mock('../lib/auth', () => ({ authOptions: {} }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

const tables: Record<string, unknown[]> = {};
const insert = vi.fn(async (table: string, doc: Record<string, unknown>) => {
  const row = { id: `${table}-new`, row_version: 1, ...doc };
  (tables[table] ??= []).push(row);
  return row;
});
const update = vi.fn(async () => ({}));
const remove = vi.fn(async () => {});

vi.mock('../lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: async (table: string) => tables[table] ?? [],
    findOne: async (table: string, id: string) =>
      (tables[table] ?? []).find((r) => (r as { id: string }).id === id) ?? null,
    insert: (...args: Parameters<typeof insert>) => insert(...args),
    update: (...args: Parameters<typeof update>) => update(...args),
    delete: (...args: Parameters<typeof remove>) => remove(...args),
  },
}));

const { createPollAction, closePollAction, confirmSlotAction, deletePollAction } = await import(
  '../app/(app)/meetings/polls/actions'
);
const { createMeeting } = await import('../app/(app)/meetings/actions');
const { createTask, updateTaskStatus, updateTaskDetails } = await import('../app/(app)/tasks/actions');
const { saveWeeklyUpdateAction } = await import('../app/(app)/tasks/update-actions');

/** Monday of an ISO week far enough out that no test depends on today. */
const WEEK = '2026-W40';
const MONDAY = '2026-09-28';

function signedInAs(id: string, role = 'student') {
  getServerSessionMock.mockResolvedValue({
    user: { id, name: id, email: `${id}@test.com`, role },
  });
}

/** A poll for a slot inside WEEK, already in the sheet. */
function seedPoll() {
  tables['availability_polls'] = [
    { id: 'p1', title: 'Progress', owner_id: 'lead', status: 'open', meeting_id: '', row_version: 1 },
  ];
  tables['availability_slots'] = [
    {
      id: 's1',
      poll_id: 'p1',
      start_at: `${MONDAY}T03:00:00.000Z`, // 10:00 in Bangkok
      end_at: `${MONDAY}T04:00:00.000Z`,
      row_version: 1,
    },
  ];
  tables['availability_votes'] = [];
}

beforeEach(() => {
  getServerSessionMock.mockReset();
  insert.mockClear();
  update.mockClear();
  remove.mockClear();
  for (const key of Object.keys(tables)) delete tables[key];
  tables['week_leads'] = [{ id: 'wl1', week_key: WEEK, user_id: 'lead', row_version: 1 }];
});

describe('opening a poll', () => {
  const slots = [{ start: `${MONDAY}T10:00`, end: `${MONDAY}T11:00` }];

  it('lets the lead of the week the slots fall in open one', async () => {
    signedInAs('lead');
    const result = await createPollAction({ title: 'Progress', note: '', slots });

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith('availability_polls', expect.anything(), 'lead');
  });

  it('refuses a member who does not hold that week, and writes nothing', async () => {
    signedInAs('other');
    const result = await createPollAction({ title: 'Progress', note: '', slots });

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('judges the week the slots are for, not the week it is opened in', async () => {
    // 'other' leads a different week. Holding *a* week is not holding *this* one.
    tables['week_leads'] = [{ id: 'wl2', week_key: '2026-W41', user_id: 'other', row_version: 1 }];
    signedInAs('other');

    const result = await createPollAction({ title: 'Progress', note: '', slots });
    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
  });

  it('lets an admin step in, so a week with no confirmed lead is not stuck', async () => {
    tables['week_leads'] = [];
    signedInAs('boss', 'admin');

    const result = await createPollAction({ title: 'Progress', note: '', slots });
    expect(result.ok).toBe(true);
  });

  it('refuses a plain member when the week has no lead at all', async () => {
    tables['week_leads'] = [];
    signedInAs('other');

    const result = await createPollAction({ title: 'Progress', note: '', slots });
    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
  });
});

describe('closing, confirming and deleting a poll', () => {
  beforeEach(seedPoll);

  it('refuses to close for anyone but the week lead or an admin', async () => {
    signedInAs('other');
    const result = await closePollAction('p1', 1, 'closed');

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(update).not.toHaveBeenCalled();
  });

  it('lets the week lead close it', async () => {
    signedInAs('lead');
    const result = await closePollAction('p1', 1, 'closed');

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalled();
  });

  it('refuses to turn a slot into a meeting for anyone else', async () => {
    signedInAs('other');
    const result = await confirmSlotAction('p1', 1, 's1');

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('lets the week lead confirm, creating the meeting at the slot time', async () => {
    signedInAs('lead');
    const result = await confirmSlotAction('p1', 1, 's1');

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      'meetings',
      expect.objectContaining({ start_at: `${MONDAY}T03:00:00.000Z` }),
      'lead'
    );
  });

  it('refuses to delete for anyone else, leaving every row in place', async () => {
    signedInAs('other');
    const result = await deletePollAction('p1', 1);

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('booking a meeting outright', () => {
  const meeting = {
    title: 'Progress',
    start_at: `${MONDAY}T10:00`,
    end_at: `${MONDAY}T11:00`,
  };

  // This is the escape hatch around the poll, so holding the week is not
  // enough for it -- the route for a lead is to propose times and confirm one.
  it('refuses the week lead', async () => {
    signedInAs('lead');
    const result = await createMeeting(meeting);

    expect(result).toMatchObject({ ok: false, error: 'error.roleRequired' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a professor, who outranks a student but is not the admin', async () => {
    signedInAs('prof', 'professor');
    const result = await createMeeting(meeting);

    expect(result).toMatchObject({ ok: false, error: 'error.roleRequired' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('lets an admin', async () => {
    signedInAs('boss', 'admin');
    const result = await createMeeting(meeting);

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith('meetings', expect.anything(), 'boss');
  });

  it('refuses an anonymous caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const result = await createMeeting(meeting);

    expect(result).toMatchObject({ ok: false, error: 'error.signInRequired' });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('term breaks', () => {
  const meeting = {
    title: 'Progress',
    start_at: `${MONDAY}T10:00`,
    end_at: `${MONDAY}T11:00`,
  };
  const slots = [{ start: `${MONDAY}T10:00`, end: `${MONDAY}T11:00` }];

  beforeEach(() => {
    seedPoll();
    // Week 40 is a break week (2026-09-28 to 2026-10-04)
    tables['term_breaks'] = [
      { id: 'tb1', name: 'Semester Break', start_date: '2026-09-28', end_date: '2026-10-04', row_version: 1 }
    ];
  });

  it('refuses to book a meeting during a break', async () => {
    signedInAs('boss', 'admin');
    const result = await createMeeting(meeting);
    expect(result).toMatchObject({ ok: false, error: 'error.duringBreak' });
    expect(insert).not.toHaveBeenCalled();
  });

  // The guards asked `toISOString().slice(0, 10)` which day an instant fell on,
  // which is the UTC day: anything before 07:00 in Thailand reported the day
  // before. The first morning back from a break was refused as if it were still
  // the break, and the first morning *of* one would have been let through.
  it('judges the break by the day in the lab, not the day in UTC', async () => {
    signedInAs('boss', 'admin');

    // 2026-10-05 is the Monday term resumes; the break ended the day before.
    const result = await createMeeting({
      title: 'First one back',
      start_at: '2026-10-05T06:00',
      end_at: '2026-10-05T07:00',
    });

    expect(result.ok).toBe(true);
  });

  it('still refuses 06:00 on the last morning of the break', async () => {
    signedInAs('boss', 'admin');

    const result = await createMeeting({
      title: 'One too early',
      start_at: '2026-10-04T06:00',
      end_at: '2026-10-04T07:00',
    });

    expect(result).toMatchObject({ ok: false, error: 'error.duringBreak' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses to open a poll for slots during a break', async () => {
    signedInAs('boss', 'admin');
    const result = await createPollAction({ title: 'Progress', note: '', slots });
    expect(result).toMatchObject({ ok: false, error: 'error.duringBreak' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses to confirm a slot during a break (in case a break is declared after the poll opens)', async () => {
    signedInAs('boss', 'admin');
    const result = await confirmSlotAction('p1', 1, 's1');
    expect(result).toMatchObject({ ok: false, error: 'error.duringBreak' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses to confirm a week lead for a break week', async () => {
    const { setWeekLead } = await import('../app/(app)/meetings/actions');
    signedInAs('prof', 'professor');
    const result = await setWeekLead(WEEK, 'lead');
    expect(result).toMatchObject({ ok: false, error: 'error.duringBreak' });
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('task permissions', () => {
  beforeEach(() => {
    tables['tasks'] = [
      { id: 't1', title: 'Task 1', assignee_ids: ['student1'], status: 'draft', row_version: 1 }
    ];
  });

  it('allows any signed-in user to change status if they are an assignee', async () => {
    signedInAs('student1');
    const result = await updateTaskStatus('t1', 'in_progress', 1);
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalled();
  });

  it('allows a manager (professor/admin) to change status even if not assigned', async () => {
    signedInAs('prof', 'professor');
    const result = await updateTaskStatus('t1', 'in_progress', 1);
    expect(result.ok).toBe(true);
  });

  it('refuses status change from a student who is not assigned', async () => {
    signedInAs('student2');
    const result = await updateTaskStatus('t1', 'in_progress', 1);
    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('allows professor to create a task', async () => {
    signedInAs('prof', 'professor');
    const result = await createTask({ title: 'New Task' });
    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalled();
  });

  it('refuses student from creating a task', async () => {
    signedInAs('student1');
    const result = await createTask({ title: 'New Task' });
    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('allows manager to edit task details', async () => {
    signedInAs('admin1', 'admin');
    const result = await updateTaskDetails('t1', { title: 'Updated' }, 1);
    expect(result.ok).toBe(true);
  });

  it('refuses student from editing task details', async () => {
    signedInAs('student1');
    const result = await updateTaskDetails('t1', { title: 'Updated' }, 1);
    expect(result.ok).toBe(false);
  });
});

describe('weekly progress permissions', () => {
  beforeEach(() => {
    tables['tasks'] = [
      { id: 't1', title: 'Task 1', assignee_ids: ['student1'], status: 'draft', row_version: 1 }
    ];
    tables['task_updates'] = [];
  });

  const input = {
    taskId: 't1',
    progressPct: 10,
    summary: 'Did some work',
    risks: '',
    nextPlan: '',
    weekKey: WEEK
  };

  it('allows an assignee to record their own progress', async () => {
    signedInAs('student1');
    const result = await saveWeeklyUpdateAction(input);
    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith('task_updates', expect.anything(), 'student1');
  });

  it('refuses a non-assignee who is not the lead', async () => {
    signedInAs('student2');
    const result = await saveWeeklyUpdateAction(input);
    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('allows the lead of the week to record anyone’s progress for that week', async () => {
    signedInAs('lead');
    const result = await saveWeeklyUpdateAction(input);
    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalled();
  });

  it('refuses the lead of a different week to record progress', async () => {
    signedInAs('lead');
    // lead is assigned to WEEK (2026-W40)
    const result = await saveWeeklyUpdateAction({ ...input, weekKey: '2026-W41' });
    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('allows professor/admin to record anyone’s progress', async () => {
    signedInAs('prof', 'professor');
    const result = await saveWeeklyUpdateAction(input);
    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalled();
  });
});
