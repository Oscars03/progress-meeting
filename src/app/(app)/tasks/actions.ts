'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, AuthorizationError } from '@/lib/auth-guard';
import { canAddOwnWork, canAssignWork, canEditWork } from '@/lib/task-rights';
import type { UserRecord } from '@/lib/db/schema';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import type { TaskRecord } from '@/lib/db/schema';
import { TASK_STATUSES, type TaskStatus } from './statuses';

function assertStatus(value: string): asserts value is TaskStatus {
  if (!(TASK_STATUSES as readonly string[]).includes(value)) {
    throw new UserError('error.invalidValue', { value });
  }
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

    revalidatePath('/tasks');
    revalidatePath('/dashboard');
  });
}

export async function createTask(data: {
  title: string;
  details?: string;
  due_date?: string;
  priority?: string;
  status?: string;
  assignee_ids?: string[];
  assigner_id?: string;
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
    const requested = data.assignee_ids ?? [];
    const assignees = canAssignWork(actor) ? requested : [actor.id];

    // Who asked for it. Only a professor can be named, so this cannot become a
    // way to attribute work to a student who never set it.
    let assigner = '';
    if (data.assigner_id) {
      const users = await SheetRepo.find<UserRecord>('users');
      const named = users.find((u) => u.id === data.assigner_id);
      if (!named || named.role !== 'professor') {
        throw new UserError('tasks.assignerMustBeProfessor');
      }
      assigner = named.id;
    }

    await SheetRepo.insert(
      'tasks',
      {
        title,
        details: data.details?.trim() ?? '',
        owner_id: actor.id,
        assignee_ids: assignees,
        assigner_id: assigner,
        due_date: data.due_date ?? '',
        priority: data.priority ?? 'medium',
        progress_pct: 0,
        status,
        overdue_flag: false,
        category: '',
        project: '',
        meeting_id: '',
        links: [],
      },
      actor.id
    );

    revalidatePath('/tasks');
    revalidatePath('/dashboard');
  });
}

export async function updateTaskDetails(
  taskId: string,
  data: {
    title?: string;
    details?: string;
    due_date?: string;
    priority?: string;
    assignee_ids?: string[];
  },
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    if (!canAssignWork(actor)) {
      throw new AuthorizationError();
    }
    
    const task = await SheetRepo.findOne<TaskRecord>('tasks', taskId);
    if (!task) throw new UserError('error.notFound');

    const updates: Partial<TaskRecord> = {};
    if (data.title !== undefined) {
      const title = data.title.trim();
      if (!title) throw new UserError('tasks.titleRequired');
      updates.title = title;
    }
    if (data.details !== undefined) updates.details = data.details.trim();
    if (data.due_date !== undefined) updates.due_date = data.due_date;
    if (data.priority !== undefined) updates.priority = data.priority;
    if (data.assignee_ids !== undefined) updates.assignee_ids = data.assignee_ids;

    await SheetRepo.update<TaskRecord>(
      'tasks',
      taskId,
      updates,
      rowVersion,
      actor.id
    );

    revalidatePath('/tasks');
    revalidatePath('/dashboard');
  });
}
