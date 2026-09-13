'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import { rotationMembers } from '@/lib/rotation';
import type { MeetingRecord, UserRecord } from '@/lib/db/schema';

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function createMeeting(data: {
  title: string;
  start_at: string;
  end_at: string;
  location?: string;
  meet_link?: string;
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('student');

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
 * Confirm who runs a meeting. Writing host_id is what turns the rotation's
 * suggestion into a decision -- until then the dashboard only proposes.
 *
 * Passing an empty userId clears the duty, so a wrong confirmation can be
 * undone without editing the sheet by hand.
 */
export async function setMeetingHost(
  meetingId: string,
  userId: string,
  rowVersion: number,
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('professor');

    const meeting = await SheetRepo.findOne<MeetingRecord>('meetings', meetingId);
    if (!meeting) throw new UserError('error.notFound');

    if (userId) {
      const users = await SheetRepo.find<UserRecord>('users');
      const eligible = rotationMembers(users).some((student) => student.id === userId);
      if (!eligible) throw new UserError('rotation.notEligible');
    }

    await SheetRepo.update('meetings', meetingId, { host_id: userId }, rowVersion, actor.id);

    revalidatePath('/meetings');
    revalidatePath(`/meetings/${meetingId}`);
    revalidatePath('/dashboard');
  });
}
