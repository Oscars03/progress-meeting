import type { TaskRecord } from './db/schema';

/**
 * A task's title as it should read away from the tracker: a sub-project
 * carries its project's name in front, "Thesis › Chapter 2", because on a list
 * of somebody's open work "Chapter 2" alone does not say whose chapter.
 *
 * Takes every task, so the parent can be found; a parent that has gone leaves
 * the title as it is.
 */
export function taskTitles(tasks: Pick<TaskRecord, 'id' | 'title' | 'parent_id'>[]): (task: Pick<TaskRecord, 'title' | 'parent_id'>) => string {
  const titles = new Map(tasks.map((t) => [t.id, t.title] as const));
  return (task) => {
    const parent = task.parent_id ? titles.get(task.parent_id) : undefined;
    return parent ? `${parent} › ${task.title}` : task.title;
  };
}
