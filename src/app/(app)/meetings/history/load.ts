import { SheetRepo } from '@/lib/db/sheet-repo';
import { agendaWeekKey } from '@/lib/rotation';
import { pastWeeks } from '@/lib/meeting-history';
import type {
  ActionItemRecord,
  MeetingRecord,
  MinutesRecord,
  TermBreakRecord,
  TopicRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';

/**
 * Every finished week and the people named in it, for the history list and
 * for one week's page -- both read the same record, so they read it the same
 * way.
 */
export async function loadHistory() {
  const [users, meetings, minutes, topics, leads, actionItems, breaks] = await Promise.all([
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<MeetingRecord>('meetings'),
    SheetRepo.find<MinutesRecord>('minutes'),
    SheetRepo.find<TopicRecord>('topics'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    SheetRepo.find<ActionItemRecord>('action_items'),
    SheetRepo.find<TermBreakRecord>('term_breaks').catch(() => []),
  ]);

  const weeks = pastWeeks({ meetings, minutes, topics, leads, actionItems }, agendaWeekKey(meetings, breaks));
  const names = new Map(users.map((user) => [user.id, user.name] as const));
  return { weeks, nameOf: (id: string) => names.get(id) };
}
