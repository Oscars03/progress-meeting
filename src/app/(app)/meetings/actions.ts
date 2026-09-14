'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import { rotationMembers } from '@/lib/rotation';
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
 * Book a meeting directly, without asking anyone.
 *
 * Admin only, and deliberately so: the way a meeting is meant to come about is
 * a poll -- propose times, everyone answers, the winning slot becomes the
 * meeting. This skips all of that, so it is the escape hatch rather than the
 * route, and the button for it is not shown to anyone else.
 */
export async function createMeeting(data: {
  title: string;
  start_at: string;
  end_at: string;
  location?: string;
  meet_link?: string;
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('admin');

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
