'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole, requireSession } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import { isWeekLead, rotationMembers } from '@/lib/rotation';
import { weekKey } from '@/lib/week';
import type { UserRecord, WeekLeadRecord } from '@/lib/db/schema';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Book a meeting.
 *
 * Same rule as asking for confirmation: the week's lead is the one preparing
 * that meeting, so scheduling it is their job. Creating a meeting outright is
 * the stronger of the two actions -- it skips asking anyone -- so leaving it
 * open to everybody while the poll was restricted made no sense. Admin remains
 * the fallback for a week whose lead is not settled.
 */
export async function createMeeting(data: {
  title: string;
  start_at: string;
  end_at: string;
  location?: string;
  meet_link?: string;
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();

    const title = data.title?.trim();
    if (!title) throw new UserError('meetings.topicRequired');
    if (!data.start_at || !data.end_at) throw new UserError('meetings.timesRequired');

    const start = new Date(data.start_at);
    const end = new Date(data.end_at);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new UserError('error.dateInvalid');
    }
    if (end <= start) throw new UserError('error.endBeforeStart');

    const meetLink = data.meet_link?.trim() ?? '';
    if (meetLink && !isHttpUrl(meetLink)) {
      throw new UserError('meetings.linkInvalid');
    }

    if (actor.role !== 'admin') {
      const leads = await SheetRepo.find<WeekLeadRecord>('week_leads');
      if (!isWeekLead(leads, weekKey(start), actor.id)) throw new UserError('meetings.leadOnly');
    }

    await SheetRepo.insert(
      'meetings',
      {
        title,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        location: data.location?.trim() ?? '',
        meet_link: meetLink,
        status: 'scheduled',
        recurrence_rule: '',
        owner_id: actor.id,
        notes: '',
      },
      actor.id
    );

    revalidatePath('/meetings');
    revalidatePath('/dashboard');
  });
}

/**
 * Confirm who is responsible for a week.
 *
 * The duty is stored against the ISO week rather than a meeting, so it can be
 * settled before anything is scheduled -- and a week that never got a meeting
 * still records whose turn it was, which is what keeps the rotation honest.
 *
 * Passing an empty userId clears the week, so a wrong confirmation can be
 * undone without editing the sheet by hand.
 */
export async function setWeekLead(weekKey: string, userId: string): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('professor');

    if (!/^\d{4}-W\d{2}$/.test(weekKey)) {
      throw new UserError('error.invalidValue', { value: weekKey });
    }

    if (userId) {
      const users = await SheetRepo.find<UserRecord>('users');
      const eligible = rotationMembers(users).some((student) => student.id === userId);
      if (!eligible) throw new UserError('rotation.notEligible');
    }

    // Read then write rather than taking a row_version from the client: the
    // caller holds a week, not a row, and the row may not exist yet.
    const leads = await SheetRepo.find<WeekLeadRecord>('week_leads');
    const existing = leads.find((lead) => lead.week_key === weekKey);

    if (!existing) {
      if (userId) await SheetRepo.insert('week_leads', { week_key: weekKey, user_id: userId }, actor.id);
    } else if (!userId) {
      await SheetRepo.delete('week_leads', existing.id, existing.row_version, actor.id);
    } else if (existing.user_id !== userId) {
      await SheetRepo.update('week_leads', existing.id, { user_id: userId }, existing.row_version, actor.id);
    }

    revalidatePath('/meetings');
    revalidatePath('/dashboard');
  });
}
