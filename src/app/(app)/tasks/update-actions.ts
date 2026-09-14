'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession } from '@/lib/auth-guard';
import { weekKey } from '@/lib/week';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import type { TaskRecord, TaskUpdateRecord, WeekLeadRecord } from '@/lib/db/schema';
import { canRecordProgress } from '@/lib/task-rights';

function clampPct(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

/**
 * Record this week's progress on one task.
 *
 * One row per task per week: submitting again replaces the week's entry rather
 * than appending, so a task cannot show two different figures for the same
 * week and the history stays one row per week per task.
 *
 * The task's own progress_pct is kept in step, because that is what the board
 * and the dashboard read -- otherwise the weekly report and the board would
 * disagree about the same task.
 */
export async function saveWeeklyUpdateAction(input: {
  taskId: string;
  progressPct: number;
  summary: string;
  risks: string;
  nextPlan: string;
  weekKey?: string;
}): Promise<ActionResult> {
  return toResult(() => saveWeeklyUpdate(input));
}

async function saveWeeklyUpdate(input: {
  taskId: string;
  progressPct: number;
  summary: string;
  risks: string;
  nextPlan: string;
  weekKey?: string;
}) {
  const actor = await requireSession();

  const taskId = input.taskId;
  if (!taskId) throw new UserError('error.notFound');

  const summary = (input.summary ?? '').trim();
  if (!summary) throw new UserError('weekly.summaryRequired');

  const key = input.weekKey?.trim() || weekKey();
  const progress = clampPct(input.progressPct);

  const [tasks, updates, leads] = await Promise.all([
    SheetRepo.find<TaskRecord>('tasks'),
    SheetRepo.find<TaskUpdateRecord>('task_updates'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
  ]);

  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new UserError('error.notFound');

  if (!canRecordProgress(actor, task, key, leads)) {
    throw new UserError('error.roleRequired');
  }

  const existing = updates.find((u) => u.task_id === taskId && u.week_key === key);

  const fields = {
    progress_pct: progress,
    summary,
    risks: (input.risks ?? '').trim(),
    next_plan: (input.nextPlan ?? '').trim(),
    updated_by: actor.id,
  };

  if (existing) {
    await SheetRepo.update<TaskUpdateRecord>(
      'task_updates',
      existing.id,
      fields,
      existing.row_version,
      actor.id
    );
  } else {
    await SheetRepo.insert(
      'task_updates',
      { task_id: taskId, week_key: key, ...fields },
      actor.id
    );
  }

  if (clampPct(task.progress_pct) !== progress) {
    await SheetRepo.update<TaskRecord>(
      'tasks',
      taskId,
      { progress_pct: progress },
      task.row_version,
      actor.id
    );
  }

  revalidatePath('/tasks');
  revalidatePath('/tasks/weekly');
  revalidatePath('/dashboard');
}
