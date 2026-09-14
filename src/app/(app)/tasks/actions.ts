'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole, requireSession, AuthorizationError } from '@/lib/auth-guard';
import { canAssignWork, canEditWork } from '@/lib/task-rights';
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
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('professor');

    const title = data.title?.trim();
    if (!title) throw new UserError('tasks.titleRequired');

    const status = data.status?.trim() || 'draft';
    assertStatus(status);

    await SheetRepo.insert(
      'tasks',
      {
        title,
        details: data.details?.trim() ?? '',
        owner_id: actor.id,
        assignee_ids: data.assignee_ids ?? [],
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
