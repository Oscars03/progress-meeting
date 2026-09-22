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
import { weekKey } from '../lib/week';

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
// Typed through vi.fn's type argument rather than the implementation, so the
// batch mocks below can call them with the repo's real argument list without
// naming parameters none of them use.
const update = vi.fn<
  (
    table: string,
    id: string,
    fields: Record<string, unknown>,
    expectedVersion: number,
    actorId?: string
  ) => Promise<object>
>(async () => ({}));
const remove = vi.fn<
  (table: string, id: string, expectedVersion: number, actorId?: string) => Promise<void>
>(async () => {});

vi.mock('../lib/db/sheet-repo', () => ({
  SheetRepo: {
    find: async (table: string) => tables[table] ?? [],
    findOne: async (table: string, id: string) =>
      (tables[table] ?? []).find((r) => (r as { id: string }).id === id) ?? null,
    insert: (...args: Parameters<typeof insert>) => insert(...args),
    update: (...args: Parameters<typeof update>) => update(...args),
    updateMany: async (
      table: string,
      items: { id: string; fields: Record<string, unknown>; expectedVersion: number }[],
      actorId?: string
    ) => {
      for (const item of items) await update(table, item.id, item.fields, item.expectedVersion, actorId);
      return items.map(() => ({}));
    },
    delete: (...args: Parameters<typeof remove>) => remove(...args),
    deleteMany: async (table: string, items: { id: string; expectedVersion: number }[]) => {
      for (const item of items) await remove(table, item.id, item.expectedVersion);
    },
  },
}));

const { createPollAction, closePollAction, confirmSlotAction, deletePollAction, voteAction } = await import(
  '../app/(app)/meetings/polls/actions'
);
const { createMeeting, deleteMeeting, rescheduleMeetingAction, autoAssignWeekLead } = await import(
  '../app/(app)/meetings/actions'
);
const { createTask, updateTaskStatus, updateTaskDetails, deleteTask, setTaskProgress, saveSubtasks } = await import(
  '../app/(app)/tasks/actions'
);
const { saveRounds } = await import('../app/(app)/tasks/round-actions');
const { saveWeeklyUpdateAction, deleteWeeklyUpdateAction } = await import('../app/(app)/tasks/update-actions');
const { updateMyNameAction } = await import('../app/(app)/settings/actions');
const { setTopicOrder, clearTopicOrder, addTopic, updateTopic, deleteTopic } = await import(
  '../app/(app)/presentations/actions'
);
const { updatePersonalEventAction } = await import('../app/(app)/settings/schedule-actions');
const { saveMinutesAction, setAgendaAction, deleteActionItemAction } = await import(
  '../app/(app)/meetings/[id]/actions'
);
const { pushMeetingAction, pullMeetingAction } = await import('../app/(app)/calendar-actions');

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

  /**
   * The meeting is named, not dated.
   *
   * It used to take the poll's title, which reads "Confirm the meeting time
   * for Sat 19 Sep 18:00-19:00". Moving the meeting afterwards could not
   * change that text, so the invitation in everybody's inbox announced an
   * hour the meeting was no longer at.
   */
  it('gives the meeting a name with no time in it', async () => {
    signedInAs('lead');
    await confirmSlotAction('p1', 1, 's1');

    const [, row] = insert.mock.calls.find(([table]) => table === 'meetings')!;
    expect(row.title).not.toMatch(/\d{1,2}[:.]\d{2}/);
    expect(row.title).toBeTruthy();
  });

  it('refuses to delete for anyone else, leaving every row in place', async () => {
    signedInAs('other');
    const result = await deletePollAction('p1', 1);

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(remove).not.toHaveBeenCalled();
  });
});

/**
 * A time is not agreed until everyone entitled to an opinion has given one.
 *
 * Confirming over the top of people who never answered produces a meeting they
 * were not asked about -- and the availability grid then shows them "busy" for
 * it, which is how it looked settled when it was not.
 */
/**
 * An admin account is not somebody the meeting has to suit.
 *
 * It takes no turn in the rotation, its free time is not weighed when finding
 * a slot, and it is not counted when deciding whether everyone has answered.
 * Accepting its vote would put a yes into a tally whose denominator leaves
 * that voter out -- so a slot could read as "everyone can make it" while a
 * real member had said nothing.
 */
describe('who may answer a poll', () => {
  beforeEach(() => {
    seedPoll();
    tables['users'] = [
      { id: 'lead', name: 'Lead', role: 'student', active: true, row_version: 1 },
      { id: 'prof', name: 'Prof', role: 'professor', active: true, row_version: 1 },
      { id: 'boss', name: 'Boss', role: 'admin', active: true, row_version: 1 },
      { id: 'gone', name: 'Gone', role: 'student', active: false, row_version: 1 },
    ];
  });

  it('lets a student answer', async () => {
    signedInAs('lead');
    const result = await voteAction('p1', 's1', 'yes');

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      'availability_votes',
      expect.objectContaining({ user_id: 'lead', choice: 'yes' }),
      'lead',
      expect.anything()
    );
  });

  // An advisor's calendar still shapes the choice -- they are in the grid --
  // but the poll is the students reporting whether they can make it, and a
  // week must not stall waiting for a click from somebody not presenting.
  it('refuses a professor, who is not one of the voters', async () => {
    signedInAs('prof', 'professor');
    const result = await voteAction('p1', 's1', 'no');

    expect(result).toMatchObject({ ok: false, error: 'polls.error.notAVoter' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses an admin, and stores nothing', async () => {
    signedInAs('boss', 'admin');
    const result = await voteAction('p1', 's1', 'yes');

    expect(result).toMatchObject({ ok: false, error: 'polls.error.notAVoter' });
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses somebody not approved yet', async () => {
    signedInAs('gone');
    const result = await voteAction('p1', 's1', 'yes');

    expect(result).toMatchObject({ ok: false, error: 'polls.error.notAVoter' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses an account that is not in the sheet at all', async () => {
    signedInAs('stranger');
    await expect(voteAction('p1', 's1', 'yes')).resolves.toMatchObject({
      ok: false,
      error: 'polls.error.notAVoter',
    });
  });
});

describe('confirming only once everyone has answered', () => {
  beforeEach(() => {
    seedPoll();
    tables['users'] = [
      { id: 'lead', name: 'Lead', role: 'student', active: true, row_version: 1 },
      { id: 'other', name: 'Other', role: 'student', active: true, row_version: 1 },
      // A member of the lab, and not a voter: the advisor attends but does
      // not report, so the confirm does not wait for them.
      { id: 'prof', name: 'Prof', role: 'professor', active: true, row_version: 1 },
      // Not a member of the lab and has no availability to state.
      { id: 'boss', name: 'Boss', role: 'admin', active: true, row_version: 1 },
      // Not approved yet, so not somebody the meeting waits for.
      { id: 'pending', name: 'Pending', role: 'student', active: false, row_version: 1 },
    ];
  });

  const voted = (...userIds: string[]) =>
    userIds.map((id, i) => ({
      id: `v${i}`,
      slot_id: 's1',
      user_id: id,
      choice: 'free',
      row_version: 1,
    }));

  it('refuses while somebody has not answered, and names them', async () => {
    tables['availability_votes'] = voted('lead');
    signedInAs('lead');

    const result = await confirmSlotAction('p1', 1, 's1');

    expect(result).toMatchObject({ ok: false, error: 'polls.error.notEveryoneAnswered' });
    expect(result).toMatchObject({ vars: { n: 1, who: 'Other' } });
    expect(insert).not.toHaveBeenCalled();
  });

  it('does not wait for an advisor, who attends but does not report', async () => {
    tables['availability_votes'] = voted('lead', 'other');
    signedInAs('lead');

    // 'prof' never voted and the confirm still goes through.
    await expect(confirmSlotAction('p1', 1, 's1')).resolves.toMatchObject({ ok: true });
  });

  it('confirms once every member has', async () => {
    tables['availability_votes'] = voted('lead', 'other', 'prof');
    signedInAs('lead');

    const result = await confirmSlotAction('p1', 1, 's1');

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith('meetings', expect.anything(), 'lead');
  });

  it('does not wait for admin, which is not a member', async () => {
    tables['availability_votes'] = voted('lead', 'other', 'prof');
    signedInAs('boss', 'admin');

    // 'boss' never voted and the confirm still goes through.
    await expect(confirmSlotAction('p1', 1, 's1')).resolves.toMatchObject({ ok: true });
  });

  it('does not wait for somebody still awaiting approval', async () => {
    tables['availability_votes'] = voted('lead', 'other', 'prof');
    signedInAs('lead');

    await expect(confirmSlotAction('p1', 1, 's1')).resolves.toMatchObject({ ok: true });
  });

  // The rule is about this time, not about the poll's other options: whether
  // somebody liked a slot nobody chose says nothing about the one that won.
  it('judges the slot being confirmed, not the whole poll', async () => {
    tables['availability_slots'] = [
      ...(tables['availability_slots'] as object[]),
      { id: 's2', poll_id: 'p1', start_at: `${MONDAY}T05:00:00.000Z`, end_at: `${MONDAY}T06:00:00.000Z`, row_version: 1 },
    ];
    tables['availability_votes'] = voted('lead', 'other', 'prof');
    signedInAs('lead');

    await expect(confirmSlotAction('p1', 1, 's1')).resolves.toMatchObject({ ok: true });
  });

  it('holds an admin to it too, so the rule is not one anybody can step around', async () => {
    tables['availability_votes'] = voted('lead');
    signedInAs('boss', 'admin');

    const result = await confirmSlotAction('p1', 1, 's1');

    expect(result).toMatchObject({ ok: false, error: 'polls.error.notEveryoneAnswered' });
    expect(insert).not.toHaveBeenCalled();
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
    signedInAs('boss', 'admin');
    const result = await setWeekLead(WEEK, 'lead');
    expect(result).toMatchObject({ ok: false, error: 'error.duringBreak' });
    expect(insert).not.toHaveBeenCalled();
  });
});

/**
 * The grace period past a meeting confirming the week by itself, once nobody
 * -- an admin, or an earlier call to this same function -- already has.
 */
describe('auto-assigning a week lead', () => {
  beforeEach(() => {
    tables['week_leads'] = [];
    tables['users'] = [
      { id: 'stu1', name: 'Stu1', role: 'student', active: true, rotation_order: 1, created_at: '2026-01-01', row_version: 1 },
      { id: 'stu2', name: 'Stu2', role: 'student', active: true, rotation_order: 2, created_at: '2026-01-02', row_version: 1 },
    ];
  });

  it("writes the rotation's own suggestion when nobody holds the week yet", async () => {
    const wrote = await autoAssignWeekLead(WEEK);

    expect(wrote).toBe(true);
    expect(insert).toHaveBeenCalledWith('week_leads', { week_key: WEEK, user_id: 'stu1' });
  });

  it("never overwrites a week somebody -- admin or itself -- already settled", async () => {
    tables['week_leads'] = [{ id: 'wl1', week_key: WEEK, user_id: 'stu2', row_version: 1 }];

    const wrote = await autoAssignWeekLead(WEEK);

    expect(wrote).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a term break week, same as the admin confirm action', async () => {
    // WEEK (2026-W40) runs 2026-09-28 to 2026-10-04, entirely inside the break.
    tables['term_breaks'] = [
      { id: 'tb1', name: 'Semester Break', start_date: '2026-09-28', end_date: '2026-10-04', row_version: 1 },
    ];

    const wrote = await autoAssignWeekLead(WEEK);

    expect(wrote).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('does nothing when nobody is in the rotation', async () => {
    tables['users'] = [];

    const wrote = await autoAssignWeekLead(WEEK);

    expect(wrote).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('rejects a malformed week key', async () => {
    const wrote = await autoAssignWeekLead('not-a-week');

    expect(wrote).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('runs with nobody signed in, since nothing here asks who the caller is', async () => {
    getServerSessionMock.mockResolvedValue(null);

    const wrote = await autoAssignWeekLead(WEEK);

    expect(wrote).toBe(true);
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
    const result = await createTask({ title: 'New Task', assignee_ids: ['student1'] });
    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalled();
  });

  // The tracker exists to say who is doing what; a row that says "nobody"
  // is the one thing it cannot show usefully.
  it('refuses work an advisor gives to nobody', async () => {
    signedInAs('prof', 'professor');
    const result = await createTask({ title: 'New Task' });
    expect(result).toMatchObject({ ok: false, error: 'tasks.assigneeRequired' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a due date before the start', async () => {
    signedInAs('student1');
    const result = await createTask({ title: 'New Task', start_date: '2026-10-10', due_date: '2026-10-01' });
    expect(result).toMatchObject({ ok: false, error: 'tasks.dueBeforeStart' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuses a round that does not exist', async () => {
    signedInAs('student1');
    tables['task_rounds'] = [{ id: 'r1', name: 'Round 1', due_date: '2026-10-31', row_version: 1 }];
    const result = await createTask({ title: 'New Task', round_id: 'gone' });
    expect(result).toMatchObject({ ok: false, error: 'tasks.roundMissing' });
  });

  // This used to be refused, which -- with no professor account in the lab --
  // meant nobody could add work at all.
  it('lets a student write down their own work', async () => {
    signedInAs('student1');
    const result = await createTask({ title: 'New Task' });

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({ assignee_ids: ['student1'], status: 'not_started' }),
      'student1'
    );
  });

  // Writing down your own work is not the same as handing work to somebody
  // else, so the list a student sends is ignored rather than obeyed.
  it('puts a student on their own task whoever they named', async () => {
    signedInAs('student1');
    await createTask({ title: 'New Task', assignee_ids: ['someone-else', 'third'] });

    expect(insert).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({ assignee_ids: ['student1'] }),
      'student1'
    );
  });

  it('lets a professor put work on somebody else', async () => {
    signedInAs('prof', 'professor');
    await createTask({ title: 'New Task', assignee_ids: ['student1'] });

    expect(insert).toHaveBeenCalledWith(
      'tasks',
      expect.objectContaining({ assignee_ids: ['student1'] }),
      'prof'
    );
  });

  describe('naming who asked for it', () => {
    beforeEach(() => {
      tables['users'] = [
        { id: 'prof', name: 'Advisor', role: 'professor', active: true, row_version: 1 },
        { id: 'student1', name: 'Student', role: 'student', active: true, row_version: 1 },
        { id: 'boss', name: 'Admin', role: 'admin', active: true, row_version: 1 },
      ];
    });

    it('records the professor a student names', async () => {
      signedInAs('student1');
      const result = await createTask({ title: 'New Task', assigner_id: 'prof' });

      expect(result.ok).toBe(true);
      expect(insert).toHaveBeenCalledWith(
        'tasks',
        expect.objectContaining({ assigner_id: 'prof' }),
        'student1'
      );
    });

    // Otherwise it becomes a way to attribute work to somebody who never set it.
    it('refuses a student named as the one who asked', async () => {
      signedInAs('student1');
      const result = await createTask({ title: 'New Task', assigner_id: 'student1' });

      expect(result).toMatchObject({ ok: false, error: 'tasks.assignerMustBeProfessor' });
      expect(insert).not.toHaveBeenCalled();
    });

    it('refuses an admin named as the one who asked', async () => {
      signedInAs('student1');
      const result = await createTask({ title: 'New Task', assigner_id: 'boss' });

      expect(result).toMatchObject({ ok: false, error: 'tasks.assignerMustBeProfessor' });
      expect(insert).not.toHaveBeenCalled();
    });

    it('leaves it blank when nobody is named', async () => {
      signedInAs('student1');
      await createTask({ title: 'New Task' });

      expect(insert).toHaveBeenCalledWith(
        'tasks',
        expect.objectContaining({ assigner_id: '' }),
        'student1'
      );
    });
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

  describe('work a student wrote down themselves', () => {
    beforeEach(() => {
      tables['tasks'] = [
        { id: 'own', title: 'Mine', owner_id: 'student1', assignee_ids: ['student1'], status: 'not_started', row_version: 4 },
      ];
    });

    it('can be corrected by the student who wrote it', async () => {
      signedInAs('student1');
      const result = await updateTaskDetails('own', { title: 'Renamed', due_date: '2026-11-30' }, 4);
      expect(result.ok).toBe(true);
      expect(update).toHaveBeenCalledWith(
        'tasks',
        'own',
        expect.objectContaining({ title: 'Renamed', due_date: '2026-11-30' }),
        4,
        'student1'
      );
    });

    // Correcting your own work is not handing it to somebody else.
    it('cannot be handed to somebody else by that student', async () => {
      signedInAs('student1');
      const result = await updateTaskDetails('own', { assignee_ids: ['student2'] }, 4);
      expect(result.ok).toBe(false);
      expect(update).not.toHaveBeenCalled();
    });

    it('cannot be edited by another student', async () => {
      signedInAs('student2');
      const result = await updateTaskDetails('own', { title: 'Taken' }, 4);
      expect(result.ok).toBe(false);
      expect(update).not.toHaveBeenCalled();
    });
  });
});

describe('progress and checklist on the tracker', () => {
  beforeEach(() => {
    tables['tasks'] = [
      { id: 't1', title: 'Task 1', assignee_ids: ['student1'], status: 'in_progress', row_version: 2 },
    ];
  });

  it('lets the person on the work move its progress, and finishes it at 100%', async () => {
    signedInAs('student1');
    const result = await setTaskProgress('t1', 100, 2);
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith(
      'tasks',
      't1',
      expect.objectContaining({ progress_pct: 100, status: 'done', progress_at: expect.any(String) }),
      2,
      'student1'
    );
  });

  it('refuses progress from a student who is not on the work', async () => {
    signedInAs('student2');
    const result = await setTaskProgress('t1', 50, 2);
    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('stores a cleaned checklist', async () => {
    signedInAs('student1');
    const result = await saveSubtasks(
      't1',
      [{ id: 'a', title: '  Collect data ', done: true }, { title: '   ' }, { title: 'Write it up' }],
      2
    );
    expect(result.ok).toBe(true);
    const fields = update.mock.calls[0][2] as { subtasks: { id: string; title: string; done: boolean }[] };
    expect(fields.subtasks).toHaveLength(2);
    expect(fields.subtasks[0]).toEqual({ id: 'a', title: 'Collect data', done: true });
    expect(fields.subtasks[1]).toMatchObject({ title: 'Write it up', done: false });
    expect(fields.subtasks[1].id).toBeTruthy();
  });

  it('refuses a checklist change from a student who is not on the work', async () => {
    signedInAs('student2');
    const result = await saveSubtasks('t1', [{ title: 'x' }], 2);
    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('submission rounds', () => {
  beforeEach(() => {
    tables['task_rounds'] = [{ id: 'r1', name: 'Round 1', due_date: '2026-10-31', row_version: 3 }];
    tables['tasks'] = [
      { id: 'same', title: 'On the round date', round_id: 'r1', due_date: '2026-10-31', row_version: 5 },
      { id: 'own', title: 'Own date', round_id: 'r1', due_date: '2026-10-15', row_version: 6 },
      { id: 'else', title: 'Elsewhere', round_id: '', due_date: '2026-10-31', row_version: 7 },
    ];
  });

  it('are set by advisors, not students', async () => {
    signedInAs('student1');
    const result = await saveRounds({ rounds: [{ name: 'Mine', due_date: '' }], removed: [] });
    expect(result.ok).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it('move the projects due on a round date when the date moves, and only those', async () => {
    signedInAs('prof', 'professor');
    const result = await saveRounds({
      rounds: [{ id: 'r1', name: 'Round 1', due_date: '2026-11-30', rowVersion: 3 }],
      removed: [],
    });
    expect(result).toMatchObject({ ok: true, moved: 1 });
    expect(update).toHaveBeenCalledWith('task_rounds', 'r1', { name: 'Round 1', due_date: '2026-11-30' }, 3, 'prof');
    expect(update).toHaveBeenCalledWith('tasks', 'same', { due_date: '2026-11-30' }, 5, 'prof');
    expect(update).not.toHaveBeenCalledWith('tasks', 'own', expect.anything(), expect.anything(), expect.anything());
    expect(update).not.toHaveBeenCalledWith('tasks', 'else', expect.anything(), expect.anything(), expect.anything());
  });

  // Nothing under a round is deleted with it: its work just leaves the round.
  it('let their projects go when removed, rather than taking them along', async () => {
    signedInAs('prof', 'professor');
    const result = await saveRounds({ rounds: [], removed: [{ id: 'r1', rowVersion: 3 }] });
    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith('task_rounds', 'r1', 3, 'prof');
    expect(remove).not.toHaveBeenCalledWith('tasks', expect.anything(), expect.anything(), expect.anything());
    expect(update).toHaveBeenCalledWith('tasks', 'same', { round_id: '' }, 5, 'prof');
    expect(update).toHaveBeenCalledWith('tasks', 'own', { round_id: '' }, 6, 'prof');
  });

  it('refuses a round without a name', async () => {
    signedInAs('prof', 'professor');
    const result = await saveRounds({ rounds: [{ name: '  ', due_date: '' }], removed: [] });
    expect(result).toMatchObject({ ok: false, error: 'tasks.roundNameRequired' });
    expect(insert).not.toHaveBeenCalled();
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
    expect(insert).toHaveBeenCalledWith('task_updates', expect.anything(), 'student1', expect.anything());
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

// Deleting a poll left the meeting it created behind, on the dashboard and
// holding the time in everyone's availability, with nothing in the UI able to
// shift it. These pin who may now remove one.
describe('removing a meeting', () => {
  beforeEach(() => {
    tables['meetings'] = [
      {
        id: 'm1',
        title: 'Progress',
        start_at: `${MONDAY}T03:00:00.000Z`, // inside WEEK, which 'lead' holds
        end_at: `${MONDAY}T04:00:00.000Z`,
        status: 'scheduled',
        owner_id: 'lead',
        google_event_id: '',
        row_version: 1,
      },
    ];
  });

  it('lets the lead of the meeting\u2019s week remove it', async () => {
    signedInAs('lead');
    const result = await deleteMeeting('m1', 1);

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith('meetings', 'm1', 1, 'lead');
  });

  it('lets an admin remove it', async () => {
    signedInAs('boss', 'admin');
    const result = await deleteMeeting('m1', 1);

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith('meetings', 'm1', 1, 'boss');
  });

  it('refuses a member who does not hold that week, and removes nothing', async () => {
    signedInAs('other');
    const result = await deleteMeeting('m1', 1);

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses the lead of a different week', async () => {
    tables['week_leads'] = [{ id: 'wl2', week_key: '2026-W41', user_id: 'other', row_version: 1 }];
    signedInAs('other');

    const result = await deleteMeeting('m1', 1);
    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('reports a meeting that is already gone rather than pretending it worked', async () => {
    signedInAs('boss', 'admin');
    const result = await deleteMeeting('does-not-exist', 1);

    expect(result).toMatchObject({ ok: false, error: 'error.notFound' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('detaches a topic from the meeting instead of deleting it', async () => {
    tables['topics'] = [
      { id: 't1', title: 'My topic', meeting_id: 'm1', owner_id: 'other', row_version: 1 },
    ];
    signedInAs('boss', 'admin');

    const result = await deleteMeeting('m1', 1);

    expect(result.ok).toBe(true);
    // The topic somebody proposed outlives the meeting it was going to be at.
    expect(update).toHaveBeenCalledWith('topics', 't1', { meeting_id: '' }, 1, 'boss');
    expect(remove).not.toHaveBeenCalledWith('topics', 't1', expect.anything(), expect.anything());
  });
});

describe('moving a confirmed meeting', () => {
  beforeEach(() => {
    tables['meetings'] = [
      {
        id: 'm1',
        title: 'Progress',
        start_at: `${MONDAY}T03:00:00.000Z`, // 10:00 in Bangkok, inside WEEK
        end_at: `${MONDAY}T04:00:00.000Z`,
        status: 'scheduled',
        owner_id: 'lead',
        google_event_id: '',
        row_version: 1,
      },
    ];
  });

  /** A wall clock on the same Monday, read as Thailand by the action. */
  const sameDay = (from: string, to: string) => ({
    start_at: `${MONDAY}T${from}`,
    end_at: `${MONDAY}T${to}`,
  });

  it('lets the lead move it to a half hour, and writes the instant', async () => {
    signedInAs('lead');
    const result = await rescheduleMeetingAction('m1', sameDay('11:30', '12:30'), 1);

    expect(result.ok).toBe(true);
    // 11:30 in Bangkok is 04:30 UTC. The half hour is the point of this.
    expect(update).toHaveBeenCalledWith(
      'meetings',
      'm1',
      { start_at: `${MONDAY}T04:30:00.000Z`, end_at: `${MONDAY}T05:30:00.000Z` },
      1,
      'lead'
    );
  });

  it('lets an admin move it', async () => {
    signedInAs('boss', 'admin');
    const result = await rescheduleMeetingAction('m1', sameDay('13:00', '14:00'), 1);

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalled();
  });

  it('refuses a member who does not hold that week, and writes nothing', async () => {
    signedInAs('other');
    const result = await rescheduleMeetingAction('m1', sameDay('13:00', '14:00'), 1);

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a lead pushing the meeting into somebody else’s week', async () => {
    signedInAs('lead');
    // The Monday after, which belongs to the next week and so to its lead.
    const result = await rescheduleMeetingAction(
      'm1',
      { start_at: '2026-10-05T13:00', end_at: '2026-10-05T14:00' },
      1
    );

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses an end that is not after the start', async () => {
    signedInAs('lead');
    const result = await rescheduleMeetingAction('m1', sameDay('13:00', '13:00'), 1);

    expect(result).toMatchObject({ ok: false, error: 'error.endBeforeStart' });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a move into a term break', async () => {
    tables['term_breaks'] = [
      { id: 'tb1', name: 'ปิดเทอม', start_date: MONDAY, end_date: MONDAY, row_version: 1 },
    ];
    signedInAs('lead');
    const result = await rescheduleMeetingAction('m1', sameDay('13:00', '14:00'), 1);

    expect(result).toMatchObject({ ok: false, error: 'error.duringBreak' });
    expect(update).not.toHaveBeenCalled();
  });

  it('reports a meeting that is already gone', async () => {
    signedInAs('boss', 'admin');
    const result = await rescheduleMeetingAction('nope', sameDay('13:00', '14:00'), 1);

    expect(result).toMatchObject({ ok: false, error: 'error.notFound' });
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * Sending a meeting to Google, and writing the record of it.
 *
 * Both looked like reads and are not. A push creates the event and invites
 * every member -- any signed-in student could re-send the whole lab an
 * invitation, as often as they liked. A pull writes Google's title, times and
 * status back over the app's. And the minutes are one row per meeting, so a
 * save replaces the agreed account of a meeting you may not have run.
 */
describe('syncing and recording a meeting', () => {
  beforeEach(() => {
    tables['meetings'] = [
      {
        id: 'm1',
        title: 'Progress',
        start_at: `${MONDAY}T03:00:00.000Z`, // inside WEEK, which 'lead' holds
        end_at: `${MONDAY}T04:00:00.000Z`,
        status: 'scheduled',
        owner_id: 'lead',
        google_event_id: '',
        row_version: 1,
      },
    ];
    tables['minutes'] = [];
  });

  it('refuses a member who does not hold the week from pushing', async () => {
    signedInAs('other');
    const result = await pushMeetingAction('m1');

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
  });

  it('refuses the same member from pulling, which would overwrite the row', async () => {
    signedInAs('other');
    const result = await pullMeetingAction('m1');

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(update).not.toHaveBeenCalled();
  });

  // A professor outranks a student but does not run the week.
  it('refuses a professor who does not hold the week', async () => {
    signedInAs('prof', 'professor');
    await expect(pushMeetingAction('m1')).resolves.toMatchObject({
      ok: false,
      error: 'avail.leadOnly',
    });
  });

  it('refuses a member from writing the minutes', async () => {
    signedInAs('other');
    const result = await saveMinutesAction('m1', 'we decided things', null, null);

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('lets the week lead write them', async () => {
    signedInAs('lead');
    const result = await saveMinutesAction('m1', 'we decided things', null, null);

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith(
      'minutes',
      expect.objectContaining({ meeting_id: 'm1', content: 'we decided things' }),
      'lead',
      expect.anything()
    );
  });

  it('lets an admin write them', async () => {
    signedInAs('boss', 'admin');
    await expect(saveMinutesAction('m1', 'note', null, null)).resolves.toMatchObject({ ok: true });
  });

  it('refuses the lead of a different week', async () => {
    tables['week_leads'] = [{ id: 'wl2', week_key: '2026-W41', user_id: 'other', row_version: 1 }];
    signedInAs('other');

    await expect(saveMinutesAction('m1', 'note', null, null)).resolves.toMatchObject({
      ok: false,
      error: 'avail.leadOnly',
    });
  });

  it('reports a meeting that is not there rather than pretending', async () => {
    signedInAs('lead');
    await expect(saveMinutesAction('nope', 'note', null, null)).resolves.toMatchObject({
      ok: false,
      error: 'error.notFound',
    });
  });

  /**
   * The running order of a meeting, and the items it hands out.
   *
   * Both were professor-and-above, which gave an advisor the shape of a
   * meeting they do not run while the student running it could not touch it.
   * They follow the minutes now: the week's lead, or admin.
   */
  describe('the agenda and its action items', () => {
    beforeEach(() => {
      tables['meeting_attendees'] = [
        { id: 'ma1', meeting_id: 'm1', user_id: 'lead', present_order: '', row_version: 1 },
      ];
      tables['action_items'] = [
        { id: 'ai1', meeting_id: 'm1', title: 'Read the paper', owner_id: 'other', row_version: 1 },
      ];
    });

    it('refuses a professor setting the order, and writes nothing', async () => {
      signedInAs('prof', 'professor');
      await expect(setAgendaAction('m1', ['lead'])).resolves.toMatchObject({
        ok: false,
        error: 'avail.leadOnly',
      });
      expect(update).not.toHaveBeenCalled();
    });

    it('lets the week lead set it', async () => {
      signedInAs('lead');
      await expect(setAgendaAction('m1', ['lead'])).resolves.toMatchObject({ ok: true });
    });

    it("refuses a professor removing somebody's action item", async () => {
      signedInAs('prof', 'professor');
      await expect(deleteActionItemAction('m1', 'ai1', 1)).resolves.toMatchObject({
        ok: false,
        error: 'avail.leadOnly',
      });
      expect(remove).not.toHaveBeenCalled();
    });

    it('lets the week lead remove one', async () => {
      signedInAs('lead');
      await expect(deleteActionItemAction('m1', 'ai1', 1)).resolves.toMatchObject({ ok: true });
      expect(remove).toHaveBeenCalledWith('action_items', 'ai1', 1, 'lead');
    });
  });
});

// Renaming yourself. The interesting property is not that it works but that it
// cannot reach anybody else's row: the action takes a name and nothing else,
// so there is no id for a caller to swap.
describe('changing your own display name', () => {
  beforeEach(() => {
    tables['users'] = [
      { id: 'me', name: 'Old Name', email: 'me@test.com', role: 'student', active: true, row_version: 3 },
      { id: 'someone-else', name: 'Not Mine', email: 'other@test.com', role: 'student', active: true, row_version: 1 },
    ];
  });

  it('writes to the caller\u2019s own row, at the version it just read', async () => {
    signedInAs('me');
    const result = await updateMyNameAction('  New   Name  ');

    expect(result.ok).toBe(true);
    // Trimmed, and inner runs of whitespace collapsed.
    expect(update).toHaveBeenCalledWith('users', 'me', { name: 'New Name' }, 3, 'me');
  });

  it('touches nobody else, whatever is passed', async () => {
    signedInAs('me');
    await updateMyNameAction('New Name');

    expect(update).not.toHaveBeenCalledWith(
      'users',
      'someone-else',
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
  });

  it('refuses an empty name rather than blanking the field everything reads', async () => {
    signedInAs('me');
    const result = await updateMyNameAction('   ');

    expect(result).toMatchObject({ ok: false, error: 'users.error.nameRequired' });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a name too long to sit in a table cell', async () => {
    signedInAs('me');
    const result = await updateMyNameAction('x'.repeat(61));

    expect(result).toMatchObject({ ok: false, error: 'users.error.nameTooLong' });
    expect(update).not.toHaveBeenCalled();
  });

  it('writes nothing when the name has not actually changed', async () => {
    signedInAs('me');
    const result = await updateMyNameAction('Old Name');

    expect(result.ok).toBe(true);
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses an anonymous caller', async () => {
    getServerSessionMock.mockResolvedValue(null);
    const result = await updateMyNameAction('Whoever');

    expect(result).toMatchObject({ ok: false, error: 'error.signInRequired' });
    expect(update).not.toHaveBeenCalled();
  });
});

// The lead prepares that week's meeting, so the order it runs in is theirs.
// It was professor-and-above only, which meant the one person actually running
// the meeting had to ask somebody else to move a name.
describe('arranging the running order', () => {
  beforeEach(() => {
    tables['topics'] = [
      { id: 't1', title: 'A', owner_id: 'lead', week_key: WEEK, status: 'planned', row_version: 1 },
      { id: 't2', title: 'B', owner_id: 'other', week_key: WEEK, status: 'planned', row_version: 1 },
    ];
  });

  const order = [
    { id: 't2', row_version: 1 },
    { id: 't1', row_version: 1 },
  ];

  it('lets the lead of that week arrange it', async () => {
    signedInAs('lead');
    const result = await setTopicOrder(order, WEEK);

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith('topics', 't2', { present_order: 1 }, 1, 'lead');
    expect(update).toHaveBeenCalledWith('topics', 't1', { present_order: 2 }, 1, 'lead');
  });

  // An advisor reads the order and does not set it: arranging the week is
  // part of running it, and they do not run it.
  it('refuses a professor, who does not run the week', async () => {
    signedInAs('prof', 'professor');
    const result = await setTopicOrder(order, WEEK);

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(update).not.toHaveBeenCalled();
  });

  it('lets an admin arrange it', async () => {
    signedInAs('boss', 'admin');
    const result = await setTopicOrder(order, WEEK);
    expect(result.ok).toBe(true);
  });

  /**
   * The permission table, end to end: a student who holds `arrangeOrder`
   * may set the order without being promoted, and the action -- not just the
   * button -- honours it.
   */
  it('lets a student an admin granted arrangeOrder do it', async () => {
    tables['users'] = [
      {
        id: 'helper',
        name: 'Helper',
        role: 'student',
        active: true,
        row_version: 1,
        permissions: { arrangeOrder: true },
      },
    ];
    signedInAs('helper');

    await expect(setTopicOrder(order, WEEK)).resolves.toMatchObject({ ok: true });
  });

  it('still refuses a student without it', async () => {
    tables['users'] = [
      { id: 'helper', name: 'Helper', role: 'student', active: true, row_version: 1, permissions: '' },
    ];
    signedInAs('helper');

    await expect(setTopicOrder(order, WEEK)).resolves.toMatchObject({
      ok: false,
      error: 'avail.leadOnly',
    });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses a member who does not hold that week', async () => {
    signedInAs('other');
    const result = await setTopicOrder(order, WEEK);

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(update).not.toHaveBeenCalled();
  });

  // Rearranging one week answers to whoever led it, not to this week's lead.
  it('refuses the lead of a different week', async () => {
    signedInAs('lead');
    const result = await setTopicOrder(order, '2026-W41');

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(update).not.toHaveBeenCalled();
  });

  it('applies the same rule to clearing the order', async () => {
    signedInAs('other');
    const result = await clearTopicOrder(order, WEEK);

    expect(result).toMatchObject({ ok: false, error: 'avail.leadOnly' });
    expect(update).not.toHaveBeenCalled();
  });
});

/**
 * An advisor runs the meeting without appearing in it: they read the week's
 * agenda and arrange it, and the topics on it belong to whoever did the work.
 *
 * Arranging is tested above and stays theirs -- what changes here is that the
 * agenda is no longer something they can write to.
 */
describe('what an advisor may do to a topic', () => {
  beforeEach(() => {
    tables['topics'] = [
      { id: 't1', title: 'A', details: '', owner_id: 'stu', week_key: WEEK, status: 'planned', row_version: 1 },
      { id: 'tp', title: 'Mine', details: '', owner_id: 'prof', week_key: WEEK, status: 'planned', row_version: 1 },
    ];
  });

  it('refuses a professor adding one, and writes nothing', async () => {
    signedInAs('prof', 'professor');
    const result = await addTopic({ title: 'Something to show', week_key: WEEK });

    expect(result).toMatchObject({ ok: false, error: 'topics.advisorNoTopics' });
    expect(insert).not.toHaveBeenCalled();
  });

  it('lets a student add one, under their own name', async () => {
    signedInAs('stu');
    const result = await addTopic({ title: 'Nav2 trial 3', week_key: WEEK });

    expect(result.ok).toBe(true);
    expect(insert).toHaveBeenCalledWith('topics', expect.objectContaining({ owner_id: 'stu' }), 'stu');
  });

  // The admin account is the one that fixes what nobody else can, so the rule
  // is about advising rather than about rank.
  it('lets an admin add one', async () => {
    signedInAs('boss', 'admin');
    const result = await addTopic({ title: 'Housekeeping', week_key: WEEK });

    expect(result.ok).toBe(true);
  });

  it("refuses a professor rewording somebody else's", async () => {
    signedInAs('prof', 'professor');
    const result = await updateTopic('t1', { title: 'Renamed' }, 1);

    expect(result).toMatchObject({ ok: false, error: 'topics.notYours' });
    expect(update).not.toHaveBeenCalled();
  });

  it("refuses a professor dropping somebody else's", async () => {
    signedInAs('prof', 'professor');
    const result = await deleteTopic('t1', 1);

    expect(result).toMatchObject({ ok: false, error: 'topics.notYours' });
    expect(remove).not.toHaveBeenCalled();
  });

  // A professor who wrote one before this rule still owns it, and an owner is
  // always allowed to correct or withdraw their own.
  it('lets a professor edit the one they already own', async () => {
    signedInAs('prof', 'professor');
    const result = await updateTopic('tp', { title: 'Corrected' }, 1);

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith(
      'topics',
      'tp',
      { title: 'Corrected', details: '' },
      1,
      'prof',
    );
  });

  it("lets an admin fix anybody's", async () => {
    signedInAs('boss', 'admin');
    const result = await updateTopic('t1', { title: 'Fixed' }, 1);

    expect(result.ok).toBe(true);
  });
});

// Hours you blocked out could be created and deleted but never changed, so a
// block that started an hour late had to be destroyed and retyped.
describe('editing your own busy hours', () => {
  beforeEach(() => {
    tables['personal_events'] = [
      {
        id: 'pe1',
        user_id: 'me',
        title: 'Lab work',
        start_at: `${MONDAY}T03:00:00.000Z`,
        end_at: `${MONDAY}T04:00:00.000Z`,
        color: '',
        category: '',
        row_version: 4,
      },
    ];
  });

  const fields = {
    title: 'Lab work',
    start_at: `${MONDAY}T11:00`,
    end_at: `${MONDAY}T12:00`,
    color: 'sky',
    category: 'study',
  };

  it('lets the owner move them, storing the new span as an instant', async () => {
    signedInAs('me');
    const result = await updatePersonalEventAction('pe1', fields, 4);

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith(
      'personal_events',
      'pe1',
      // 11:00 in the lab is 04:00Z -- read as Thailand, not as the server.
      expect.objectContaining({ start_at: `${MONDAY}T04:00:00.000Z`, color: 'sky', category: 'study' }),
      4,
      'me'
    );
  });

  // Not even an admin: when a colleague said they were busy is not somebody
  // else's to rewrite.
  it('refuses anybody else, including an admin', async () => {
    signedInAs('boss', 'admin');
    const result = await updatePersonalEventAction('pe1', fields, 4);

    expect(result).toMatchObject({ ok: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('refuses an end that is not after the start', async () => {
    signedInAs('me');
    const result = await updatePersonalEventAction(
      'pe1',
      { ...fields, end_at: `${MONDAY}T11:00` },
      4
    );

    expect(result).toMatchObject({ ok: false });
    expect(update).not.toHaveBeenCalled();
  });

  it('stores an unrecognised colour as none rather than refusing the edit', async () => {
    signedInAs('me');
    const result = await updatePersonalEventAction(
      'pe1',
      { ...fields, color: 'chartreuse', category: 'nonsense' },
      4
    );

    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith(
      'personal_events',
      'pe1',
      expect.objectContaining({ color: '', category: '' }),
      4,
      'me'
    );
  });
});

// Work could be created, moved and edited, then stayed on the board for good.
describe('removing a piece of work', () => {
  beforeEach(() => {
    tables['tasks'] = [
      { id: 'tk1', title: 'Mine', owner_id: 'me', assignee_ids: ['other'], status: 'in_progress', row_version: 3 },
    ];
    tables['task_updates'] = [
      { id: 'up1', task_id: 'tk1', week_key: WEEK, summary: 'a', row_version: 1 },
      { id: 'up2', task_id: 'tk1', week_key: '2026-W41', summary: 'b', row_version: 1 },
      { id: 'other', task_id: 'tk-other', week_key: WEEK, summary: 'c', row_version: 1 },
    ];
  });

  it('lets whoever wrote it down withdraw it', async () => {
    signedInAs('me');
    const result = await deleteTask('tk1', 3);

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith('tasks', 'tk1', 3, 'me');
  });

  // A report is a statement about this task and means nothing without it --
  // left behind it is the same orphan the calendar had with a deleted poll.
  it('takes the weekly reports about it, and only those', async () => {
    signedInAs('me');
    await deleteTask('tk1', 3);

    expect(remove).toHaveBeenCalledWith('task_updates', 'up1', 1, 'me');
    expect(remove).toHaveBeenCalledWith('task_updates', 'up2', 1, 'me');
    expect(remove).not.toHaveBeenCalledWith('task_updates', 'other', 1, 'me');
  });

  it('lets admin remove anything, which is the only way to clear a mistake', async () => {
    signedInAs('boss', 'admin');
    const result = await deleteTask('tk1', 3);
    expect(result.ok).toBe(true);
  });

  // The advisor asked for the work, so the advisor can say it is no longer
  // wanted. Setting it, changing it and taking it back are one job.
  it('lets an advisor remove anything too', async () => {
    signedInAs('prof', 'professor');
    const result = await deleteTask('tk1', 3);
    expect(result.ok).toBe(true);
  });

  // Otherwise a student could answer an assignment by deleting it.
  it('refuses an assignee who did not write it down', async () => {
    signedInAs('other');
    const result = await deleteTask('tk1', 3);

    expect(result).toMatchObject({ ok: false });
    expect(remove).not.toHaveBeenCalled();
  });

  it('reports work already gone rather than pretending it worked', async () => {
    signedInAs('me');
    const result = await deleteTask('missing', 1);

    expect(result).toMatchObject({ ok: false, error: 'error.notFound' });
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('taking back a weekly progress report', () => {
  beforeEach(() => {
    tables['tasks'] = [
      { id: 'tk1', title: 'Work', owner_id: 'prof', assignee_ids: ['me'], status: 'in_progress', row_version: 1 },
    ];
    tables['task_updates'] = [
      { id: 'up1', task_id: 'tk1', week_key: WEEK, summary: 'a', row_version: 2 },
    ];
  });

  it('lets the person the work belongs to withdraw their own', async () => {
    signedInAs('me');
    const result = await deleteWeeklyUpdateAction('up1', 2);

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith('task_updates', 'up1', 2, 'me');
  });

  it('lets the lead of the week it covers withdraw it', async () => {
    signedInAs('lead');
    const result = await deleteWeeklyUpdateAction('up1', 2);
    expect(result.ok).toBe(true);
  });

  // Judged on the week the report is for, exactly as writing one is.
  it('refuses the lead of a different week', async () => {
    tables['week_leads'] = [{ id: 'wl2', week_key: '2026-W41', user_id: 'lead', row_version: 1 }];
    signedInAs('lead');

    const result = await deleteWeeklyUpdateAction('up1', 2);
    expect(result).toMatchObject({ ok: false, error: 'error.forbidden' });
    expect(remove).not.toHaveBeenCalled();
  });

  it('refuses somebody with no claim on it at all', async () => {
    signedInAs('stranger');
    const result = await deleteWeeklyUpdateAction('up1', 2);

    expect(result).toMatchObject({ ok: false, error: 'error.forbidden' });
    expect(remove).not.toHaveBeenCalled();
  });
});

// Tidying the board is part of preparing the meeting that reads from it, so
// this week's lead can clear work as well as its owner can.
describe('the week lead removing work', () => {
  // The action asks who leads *now*, so the fixture has to be this week rather
  // than the far-future week the rest of this file uses.
  const THIS_WEEK = weekKey();

  beforeEach(() => {
    tables['tasks'] = [
      { id: 'tk1', title: 'Somebody else\u2019s', owner_id: 'someone', assignee_ids: ['someone'], status: 'in_progress', row_version: 1 },
    ];
    tables['task_updates'] = [];
    tables['week_leads'] = [
      { id: 'wl-now', week_key: THIS_WEEK, user_id: 'thisweek', row_version: 1 },
      { id: 'wl-past', week_key: '2026-W01', user_id: 'lastterm', row_version: 1 },
    ];
  });

  it("lets this week's lead clear work they did not write", async () => {
    signedInAs('thisweek');
    const result = await deleteTask('tk1', 1);

    expect(result.ok).toBe(true);
    expect(remove).toHaveBeenCalledWith('tasks', 'tk1', 1, 'thisweek');
  });

  // The claim is "I am running this week's meeting", not "I ran one once".
  it('refuses somebody who led a different week', async () => {
    signedInAs('lastterm');
    const result = await deleteTask('tk1', 1);

    expect(result).toMatchObject({ ok: false });
    expect(remove).not.toHaveBeenCalled();
  });

  it('still refuses a member who holds no week at all', async () => {
    signedInAs('nobody');
    const result = await deleteTask('tk1', 1);

    expect(result).toMatchObject({ ok: false });
    expect(remove).not.toHaveBeenCalled();
  });
});
