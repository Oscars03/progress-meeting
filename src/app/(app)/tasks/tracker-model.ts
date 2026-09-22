/**
 * What the tracker page hands its client components: sheet rows reduced to
 * the fields the board draws, with every "may this person..." already
 * answered by the same rules the actions enforce.
 *
 * A plain module -- the page imports the builder, the client components the
 * types -- so nothing here is a server reference.
 */

import type { SessionUser } from '@/lib/auth-guard';
import type {
  TaskRecord,
  TaskRoundRecord,
  TaskUpdateRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';
import { labDay } from '@/lib/lab-time';
import { canEditDetails, canEditWork, canRemoveWork } from '@/lib/task-rights';
import {
  isDay,
  laterDay,
  projectHealth,
  readSubtasks,
  type Health,
  type Subtask,
} from '@/lib/tracker';
import { readStatus, type TaskStatus } from './statuses';

export type TrackerPerson = {
  id: string;
  name: string;
  role: string;
  /** Which avatar colour: 0 for an advisor, 1-5 for everyone else. */
  tone: number;
};

export type TrackerRound = { id: string; name: string; due: string; rowVersion: number };

export type TrackerRow = {
  id: string;
  rowVersion: number;
  title: string;
  details: string;
  tag: string;
  /** '' when the work is in no round, or its round has since been deleted. */
  roundId: string;
  assigneeIds: string[];
  ownerId: string;
  assignerId: string;
  /** Where the bar starts; the day it was created when no start was set. */
  start: string;
  /** Whether `start` was chosen, as opposed to inferred from created_at. */
  startSet: boolean;
  due: string;
  progress: number;
  status: TaskStatus;
  subtasks: Subtask[];
  lastUpdate: string | null;
  health: Health;
  /** The latest weekly reports, newest first. */
  log: { week: string; pct: number; summary: string }[];
  can: {
    /** Move progress, tick the checklist, change status. */
    work: boolean;
    /** Rename, re-date, move between rounds. */
    edit: boolean;
    remove: boolean;
  };
};

/** assignee_ids arrives as an array, or as text from a hand-edited cell. */
export function assigneesOf(task: Pick<TaskRecord, 'assignee_ids'>): string[] {
  const raw = task.assignee_ids;
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/** The lab day an ISO instant falls on, or null for anything unreadable. */
function dayOf(iso: unknown): string | null {
  if (typeof iso !== 'string' || !iso) return null;
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? null : labDay(t);
}

function toneOf(user: Pick<UserRecord, 'id' | 'role'>): number {
  if (user.role === 'professor') return 0;
  let h = 0;
  for (const ch of user.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 5) + 1;
}

export function toPeople(users: UserRecord[]): TrackerPerson[] {
  return users.map((u) => ({ id: u.id, name: u.name || '—', role: u.role, tone: toneOf(u) }));
}

/** Dated rounds by deadline, then the ones without a date in the order made. */
export function toRounds(rounds: TaskRoundRecord[]): TrackerRound[] {
  return rounds
    .map((r) => ({ id: r.id, name: r.name, due: isDay(r.due_date) ? r.due_date : '', rowVersion: r.row_version, made: r.created_at ?? '' }))
    .sort((a, b) => {
      if (a.due && b.due) return a.due < b.due ? -1 : a.due > b.due ? 1 : 0;
      if (a.due) return -1;
      if (b.due) return 1;
      return a.made < b.made ? -1 : 1;
    })
    .map(({ id, name, due, rowVersion }) => ({ id, name, due, rowVersion }));
}

export function toRows(input: {
  actor: SessionUser;
  tasks: TaskRecord[];
  rounds: TaskRoundRecord[];
  updates: TaskUpdateRecord[];
  leads: WeekLeadRecord[];
  thisWeek: string;
  today: string;
}): TrackerRow[] {
  const { actor, tasks, rounds, updates, leads, thisWeek, today } = input;
  const roundIds = new Set(rounds.map((r) => r.id));

  return tasks.map((task) => {
    const reports = updates
      .filter((u) => u.task_id === task.id)
      .sort((a, b) => (a.week_key < b.week_key ? 1 : -1));
    const reportedOn = reports.reduce<string | null>(
      (latest, u) => laterDay(latest, dayOf(u.updated_at) ?? dayOf(u.created_at)),
      null
    );

    const startSet = isDay(task.start_date);
    const start = startSet ? task.start_date : dayOf(task.created_at) ?? today;
    const due = isDay(task.due_date) ? task.due_date : '';
    const progress = Math.min(100, Math.max(0, Math.round(Number(task.progress_pct) || 0)));
    const status = readStatus(task.status);
    const lastUpdate = laterDay(dayOf(task.progress_at), reportedOn);

    return {
      id: task.id,
      rowVersion: task.row_version,
      title: task.title,
      details: task.details ?? '',
      tag: task.category ?? '',
      roundId: roundIds.has(task.round_id) ? task.round_id : '',
      assigneeIds: assigneesOf(task),
      ownerId: task.owner_id ?? '',
      assignerId: task.assigner_id ?? '',
      start,
      startSet,
      due,
      progress,
      status,
      subtasks: readSubtasks(task.subtasks),
      lastUpdate,
      health: projectHealth({ status, start, due, progress, lastUpdate }, today),
      log: reports.slice(0, 3).map((u) => ({
        week: u.week_key,
        pct: Math.round(Number(u.progress_pct) || 0),
        summary: u.summary ?? '',
      })),
      can: {
        work: canEditWork(actor, task),
        edit: canEditDetails(actor, task),
        remove: canRemoveWork(actor, task, thisWeek, leads),
      },
    };
  });
}
