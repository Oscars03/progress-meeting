import { SheetRepo } from '@/lib/db/sheet-repo';
import type {
  TaskRecord,
  TaskRoundRecord,
  TaskUpdateRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';
import { weekKey } from '@/lib/week';
import { labDay } from '@/lib/lab-time';
import { requirePageSession } from '@/lib/auth-guard';
import { canAddOwnWork, canAssignWork, canManageRounds } from '@/lib/task-rights';
import { labMembers, pollVoters } from '@/lib/members';
import Tracker from './tracker';
import { toPeople, toRounds, toRows } from './tracker-model';

export default async function TasksPage() {
  const actor = await requirePageSession();
  const [tasks, users, leads, rounds, updates] = await Promise.all([
    SheetRepo.find<TaskRecord>('tasks'),
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    SheetRepo.find<TaskRoundRecord>('task_rounds'),
    SheetRepo.find<TaskUpdateRecord>('task_updates'),
  ]);

  const today = labDay(new Date());
  const members = labMembers(users);

  return (
    <Tracker
      rows={toRows({ actor, tasks, rounds, updates, leads, thisWeek: weekKey(), today })}
      rounds={toRounds(rounds)}
      // Everybody, for names on rows that point at an account since removed
      // from the lab; the pickers use the narrower lists below.
      people={toPeople(users)}
      // Who work can be given to: the students. An advisor sets work rather
      // than doing it, and admin is a system account.
      assignable={pollVoters(users).map((u) => u.id)}
      professors={members.filter((u) => u.role === 'professor').map((u) => u.id)}
      me={actor.id}
      today={today}
      canAdd={canAddOwnWork(actor)}
      canAssign={canAssignWork(actor)}
      canManageRounds={canManageRounds(actor)}
    />
  );
}
