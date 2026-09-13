'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole } from '@/lib/auth-guard';
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
    const actor = await requireRole('student');
    assertStatus(newStatus);

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
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('student');

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
        assignee_ids: [],
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
