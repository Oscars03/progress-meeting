'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, AuthorizationError } from '@/lib/auth-guard';
import { canManageRounds } from '@/lib/task-rights';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import type { TaskRecord, TaskRoundRecord } from '@/lib/db/schema';
import { MAX_ROUND_NAME, isDay, type RoundInput } from '@/lib/tracker';

/**
 * Save the whole list of submission rounds as the dialog left it.
 *
 * Rounds are written first and the projects under them after, so a refusal
 * part-way leaves nothing pointing at a round that is not there -- a project
 * whose round has gone simply reads as "not in a round yet", which is where
 * it would have been moved anyway.
 *
 * Two things follow a round:
 * - Deleting it moves its projects out of it. Nothing under it is deleted.
 * - Moving its deadline moves the projects that were due *on that deadline*.
 *   A project with a date of its own inside the round keeps it.
 */
export async function saveRounds(input: {
  rounds: RoundInput[];
  removed: { id: string; rowVersion: number }[];
}): Promise<ActionResult<{ moved: number }>> {
  return toResult(async () => {
    const actor = await requireSession();
    if (!canManageRounds(actor)) throw new AuthorizationError();

    const wanted = (input.rounds ?? []).map((r) => ({
      ...r,
      name: String(r.name ?? '').trim(),
      due_date: String(r.due_date ?? '').trim(),
    }));
    for (const r of wanted) {
      if (!r.name) throw new UserError('tasks.roundNameRequired');
      if (r.name.length > MAX_ROUND_NAME) throw new UserError('error.invalidValue', { value: r.name });
      if (r.due_date && !isDay(r.due_date)) throw new UserError('error.invalidValue', { value: r.due_date });
    }

    const [existing, tasks] = await Promise.all([
      SheetRepo.find<TaskRoundRecord>('task_rounds', { fresh: true }),
      SheetRepo.find<TaskRecord>('tasks', { fresh: true }),
    ]);
    const byId = new Map(existing.map((r) => [r.id, r] as const));

    // Every edit and removal names a round that is there now. Anything else
    // was edited from a stale dialog and would write over somebody's change.
    for (const r of wanted) {
      if (r.id && !byId.has(r.id)) throw new UserError('error.conflict');
    }
    for (const r of input.removed ?? []) {
      if (!byId.has(r.id)) throw new UserError('error.conflict');
    }

    const retarget = new Map<string, Partial<TaskRecord>>();

    for (const r of input.removed ?? []) {
      await SheetRepo.delete('task_rounds', r.id, r.rowVersion, actor.id);
      for (const t of tasks.filter((t) => t.round_id === r.id)) retarget.set(t.id, { round_id: '' });
    }

    for (const r of wanted) {
      if (!r.id) {
        await SheetRepo.insert('task_rounds', { name: r.name, due_date: r.due_date }, actor.id);
        continue;
      }
      const before = byId.get(r.id)!;
      if (before.name === r.name && (before.due_date ?? '') === r.due_date) continue;
      await SheetRepo.update<TaskRoundRecord>(
        'task_rounds',
        r.id,
        { name: r.name, due_date: r.due_date },
        r.rowVersion ?? 0,
        actor.id
      );
      const oldDue = before.due_date ?? '';
      if (oldDue && r.due_date && oldDue !== r.due_date) {
        for (const t of tasks.filter((t) => t.round_id === r.id && t.due_date === oldDue)) {
          retarget.set(t.id, { due_date: r.due_date });
        }
      }
    }

    if (retarget.size > 0) {
      const versions = new Map(tasks.map((t) => [t.id, t.row_version] as const));
      await SheetRepo.updateMany<TaskRecord>(
        'tasks',
        [...retarget].map(([id, fields]) => ({ id, fields, expectedVersion: versions.get(id) ?? 0 })),
        actor.id
      );
    }

    revalidatePath('/tasks');
    revalidatePath('/dashboard');
    return { moved: [...retarget.values()].filter((f) => 'due_date' in f).length };
  });
}
