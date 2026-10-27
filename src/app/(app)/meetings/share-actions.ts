'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import { labMembers } from '@/lib/members';
import { SHARE_TTL_DAYS, generateShareToken, hashShareToken } from '@/lib/calendar-share';
import type { CalendarShareRecord, UserRecord } from '@/lib/db/schema';

/**
 * Make a link to one week of the chosen people's busy hours.
 *
 * Anybody in the lab may: the link shows no more than the calendar already
 * shows them -- when, never what. The token is returned here and nowhere
 * else; only its hash is kept, so a lost link is replaced, not recovered.
 */
export async function createCalendarShareAction(input: {
  weekKey: string;
  userIds: string[];
}): Promise<ActionResult<{ token: string }>> {
  return toResult(async () => {
    const actor = await requireSession();
    if (!/^\d{4}-W\d{2}$/.test(input.weekKey)) throw new UserError('error.invalidValue', { value: input.weekKey });

    // Only people who are on the calendar to begin with; anything else sent
    // is dropped rather than shared.
    const members = new Set(labMembers(await SheetRepo.find<UserRecord>('users')).map((u) => u.id));
    const userIds = [...new Set(input.userIds)].filter((id) => members.has(id));
    if (userIds.length === 0) throw new UserError('share.pickSomeone');

    const token = generateShareToken();
    const expires = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await SheetRepo.insert(
      'calendar_shares',
      {
        token_hash: hashShareToken(token),
        week_key: input.weekKey,
        user_ids: userIds,
        expires_at: expires.toISOString(),
        revoked_at: '',
      },
      actor.id
    );
    revalidatePath('/meetings');
    return { token };
  });
}

/** Withdraw a link: whoever made it, or an admin. */
export async function revokeCalendarShareAction(id: string, rowVersion: number): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    const share = await SheetRepo.findOne<CalendarShareRecord>('calendar_shares', id);
    if (!share) throw new UserError('error.notFound');
    if (share.created_by !== actor.id && actor.role !== 'admin') throw new UserError('error.forbidden');

    await SheetRepo.update<CalendarShareRecord>(
      'calendar_shares',
      id,
      { revoked_at: new Date().toISOString() },
      rowVersion,
      actor.id
    );
    revalidatePath('/meetings');
  });
}
