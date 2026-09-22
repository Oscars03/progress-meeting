'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, AuthorizationError } from '@/lib/auth-guard';
import {
  canAddOwnWork,
  canAssignWork,
  canEditDetails,
  canEditWork,
  canRemoveWork,
} from '@/lib/task-rights';
import type { TaskRoundRecord, UserRecord } from '@/lib/db/schema';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import type { TaskRecord, TaskUpdateRecord, WeekLeadRecord } from '@/lib/db/schema';
import { weekKey } from '@/lib/week';
import { MAX_SUBTASKS, MAX_SUBTASK_TITLE, isDay, isTaskTag, type Subtask } from '@/lib/tracker';
import { TASK_STATUSES, type TaskStatus } from './statuses';

function assertStatus(value: string): asserts value is TaskStatus {
  if (!(TASK_STATUSES as readonly string[]).includes(value)) {
    throw new UserError('error.invalidValue', { value });
  }
}

function revalidateTasks() {
  revalidatePath('/tasks');
  revalidatePath('/tasks/weekly');
  revalidatePath('/dashboard');
}

/** '' or a real YYYY-MM-DD; anything else is refused rather than stored. */
function readDay(value: string | undefined): string {
  const day = (value ?? '').trim();
  if (day && !isDay(day)) throw new UserError('error.invalidValue', { value: day });
  return day;
}

function assertDateOrder(start: string, due: string) {
  if (start && due && due < start) throw new UserError('tasks.dueBeforeStart');
}

function readTag(value: string | undefined): string {
  const tag = (value ?? '').trim();
  if (tag && !isTaskTag(tag)) throw new UserError('error.invalidValue', { value: tag });
  return tag;
}

/** The round has to exist; '' means none. */
async function readRound(value: string | undefined): Promise<string> {
  const id = (value ?? '').trim();
  if (!id) return '';
  const rounds = await SheetRepo.find<TaskRoundRecord>('task_rounds');
  if (!rounds.some((r) => r.id === id)) throw new UserError('tasks.roundMissing');
  return id;
}

/** Who asked for it. Only a professor can be named. */
async function readAssigner(value: string | undefined): Promise<string> {
  if (!value) return '';
  const users = await SheetRepo.find<UserRecord>('users');
  const named = users.find((u) => u.id === value);
  if (!named || named.role !== 'professor') {
    throw new UserError('tasks.assignerMustBeProfessor');
  }
  return named.id;
}

/**
 * A checklist as the client sent it, made safe to store: titles trimmed and
 * capped, blanks dropped, ids kept where given so a tick lands on the line it
 * was meant for.
 */
function cleanSubtasks(items: { id?: string; title: string; done?: boolean }[]): Subtask[] {
  const out: Subtask[] = [];
  for (const item of items) {
    const title = String(item?.title ?? '').trim().slice(0, MAX_SUBTASK_TITLE);
    if (!title) continue;
    const id = typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID();
    out.push({ id, title, done: item.done === true });
  }
  if (out.length > MAX_SUBTASKS) throw new UserError('tasks.tooManySubtasks', { max: MAX_SUBTASKS });
  return out;
}

export async function updateTaskStatus(
  taskId: string,
  newStatus: string,
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    assertStatus(newStatus);

    const task = await SheetRepo.findOne<TaskRecord>('tasks', taskId);
    if (!task) throw new UserError('error.notFound');

    if (!canEditWork(actor, task)) {
      throw new AuthorizationError();
    }

    await SheetRepo.update<TaskRecord>(
      'tasks',
      taskId,
      { status: newStatus },
      rowVersion,
      actor.id
    );

    revalidateTasks();
  });
}

export async function createTask(data: {
  title: string;
  details?: string;
  due_date?: string;
  start_date?: string;
  round_id?: string;
  category?: string;
  priority?: string;
  status?: string;
  assignee_ids?: string[];
  assigner_id?: string;
  /** Checklist lines, one per entry. */
  subtasks?: string[];
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    if (!canAddOwnWork(actor)) throw new AuthorizationError();

    const title = data.title?.trim();
    if (!title) throw new UserError('tasks.titleRequired');

    const status = data.status?.trim() || 'not_started';
    assertStatus(status);

    // Giving work to somebody else stays with the advisors; writing down your
    // own does not. A student's list is therefore always just themselves.
    // An advisor's has to name somebody: the tracker exists to say who is
    // doing what, and a row that answers "nobody" says nothing.
    const requested = [...new Set(data.assignee_ids ?? [])].filter(Boolean);
    const assignees = canAssignWork(actor) ? requested : [actor.id];
    if (assignees.length === 0) throw new UserError('tasks.assigneeRequired');

    const start = readDay(data.start_date);
    const due = readDay(data.due_date);
    assertDateOrder(start, due);

    const [round, assigner] = await Promise.all([readRound(data.round_id), readAssigner(data.assigner_id)]);

    await SheetRepo.insert(
      'tasks',
      {
        title,
        details: data.details?.trim() ?? '',
        owner_id: actor.id,
        assignee_ids: assignees,
        assigner_id: assigner,
        due_date: due,
        start_date: start,
        round_id: round,
        priority: data.priority ?? 'medium',
        progress_pct: 0,
        status,
        overdue_flag: false,
        category: readTag(data.category),
        project: '',
        meeting_id: '',
        links: [],
        subtasks: cleanSubtasks((data.subtasks ?? []).map((line) => ({ title: line }))),
        progress_at: '',
      },
      actor.id
    );

    revalidateTasks();
  });
}

export async function updateTaskDetails(
  taskId: string,
  data: {
    title?: string;
    details?: string;
    due_date?: string;
    start_date?: string;
    round_id?: string;
    category?: string;
    priority?: string;
    assignee_ids?: string[];
    assigner_id?: string;
  },
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const task = await SheetRepo.findOne<TaskRecord>('tasks', taskId);
    if (!task) throw new UserError('error.notFound');
    if (!canEditDetails(actor, task)) throw new AuthorizationError();

    const updates: Partial<TaskRecord> = {};
    if (data.title !== undefined) {
      const title = data.title.trim();
      if (!title) throw new UserError('tasks.titleRequired');
      updates.title = title;
    }
    if (data.details !== undefined) updates.details = data.details.trim();
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.category !== undefined) updates.category = readTag(data.category);
    if (data.due_date !== undefined) updates.due_date = readDay(data.due_date);
    if (data.start_date !== undefined) updates.start_date = readDay(data.start_date);
    assertDateOrder(
      updates.start_date ?? task.start_date ?? '',
      updates.due_date ?? task.due_date ?? ''
    );
    if (data.round_id !== undefined) updates.round_id = await readRound(data.round_id);

    // Who the work is for is the advisors' to change. The owner of their own
    // work may edit everything else about it, but not hand it to somebody.
    if (data.assignee_ids !== undefined) {
      if (!canAssignWork(actor)) throw new AuthorizationError();
      const assignees = [...new Set(data.assignee_ids)].filter(Boolean);
      if (assignees.length === 0) throw new UserError('tasks.assigneeRequired');
      updates.assignee_ids = assignees;
    }
    if (data.assigner_id !== undefined) updates.assigner_id = await readAssigner(data.assigner_id);

    await SheetRepo.update<TaskRecord>(
      'tasks',
      taskId,
      updates,
      rowVersion,
      actor.id
    );

    revalidateTasks();
  });
}

/**
 * Set how far along a piece of work is.
 *
 * The quick path, from the tracker: the weekly report still carries the
 * account of *what* was done. Status follows the figure where it obviously
 * should -- 100% is finished, and anything above nothing has started -- so the
 * two cannot disagree on the board.
 */
export async function setTaskProgress(
  taskId: string,
  progressPct: number,
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const task = await SheetRepo.findOne<TaskRecord>('tasks', taskId);
    if (!task) throw new UserError('error.notFound');
    if (!canEditWork(actor, task)) throw new AuthorizationError();

    const n = Math.round(Number(progressPct));
    if (!Number.isFinite(n)) throw new UserError('error.invalidValue', { value: String(progressPct) });
    const progress = Math.min(100, Math.max(0, n));

    const fields: Partial<TaskRecord> = { progress_pct: progress, progress_at: new Date().toISOString() };
    if (progress === 100) fields.status = 'done';
    else if (task.status === 'done') fields.status = 'in_progress';
    else if (progress > 0 && task.status !== 'in_progress') fields.status = 'in_progress';

    await SheetRepo.update<TaskRecord>('tasks', taskId, fields, rowVersion, actor.id);

    revalidateTasks();
  });
}

/**
 * Replace a project's checklist.
 *
 * The whole list in one write, guarded by the row version like every other
 * write: two people ticking lines on the same project at the same moment get
 * the second one refused, not a list that quietly lost the first one's tick.
 */
export async function saveSubtasks(
  taskId: string,
  items: { id?: string; title: string; done?: boolean }[],
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const task = await SheetRepo.findOne<TaskRecord>('tasks', taskId);
    if (!task) throw new UserError('error.notFound');
    if (!canEditWork(actor, task)) throw new AuthorizationError();

    const subtasks = cleanSubtasks(Array.isArray(items) ? items : []);
    await SheetRepo.update<TaskRecord>('tasks', taskId, { subtasks }, rowVersion, actor.id);

    revalidateTasks();
  });
}

/**
 * Remove a piece of work, and the weekly reports written about it.
 *
 * There was no way to remove one at all: work could be created, moved and
 * edited, and then stayed on the board for good. A list nobody can prune stops
 * being read.
 *
 * Its progress reports go with it. They are statements *about this task* and
 * mean nothing without it -- left behind they would be the same orphan the
 * calendar had when a poll was deleted and its meeting stayed.
 */
export async function deleteTask(taskId: string, rowVersion: number): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const task = await SheetRepo.findOne<TaskRecord>('tasks', taskId);
    if (!task) throw new UserError('error.notFound');

    const leads = await SheetRepo.find<WeekLeadRecord>('week_leads');
    if (!canRemoveWork(actor, task, weekKey(), leads)) throw new AuthorizationError();

    const updates = await SheetRepo.find<TaskUpdateRecord>('task_updates');
    for (const row of updates.filter((u) => u.task_id === taskId)) {
      await SheetRepo.delete('task_updates', row.id, row.row_version, actor.id);
    }

    await SheetRepo.delete('tasks', taskId, rowVersion, actor.id);

    revalidateTasks();
  });
}
