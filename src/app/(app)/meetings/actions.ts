'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';

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
    const actor = await requireRole('member');

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
