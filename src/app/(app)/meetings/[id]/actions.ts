'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireRole, requireSession } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import type {
  ActionItemRecord,
  MeetingAttendeeRecord,
  MinutesRecord,
} from '@/lib/db/schema';

const ACTION_ITEM_STATUSES = ['open', 'done', 'dropped'] as const;
export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];

function assertItemStatus(value: string): asserts value is ActionItemStatus {
  if (!(ACTION_ITEM_STATUSES as readonly string[]).includes(value)) {
    throw new UserError('error.invalidValue', { value });
  }
}

function requireMeetingId(meetingId: string) {
  if (!meetingId) throw new UserError('error.notFound');
}

function revalidate(meetingId: string) {
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath('/meetings');
}

/**
 * Minutes are one row per meeting: saving twice updates in place rather than
 * stacking revisions, so there is a single agreed record per meeting instead
 * of a pile the room has to reconcile later.
 */
export async function saveMinutesAction(
  meetingId: string,
  content: string,
  existingId: string | null,
  rowVersion: number | null
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('member');
    requireMeetingId(meetingId);

    if (existingId && rowVersion !== null) {
      await SheetRepo.update<MinutesRecord>(
        'minutes',
        existingId,
        { content, recorded_by: actor.id },
        rowVersion,
        actor.id
      );
    } else {
      await SheetRepo.insert(
        'minutes',
        { meeting_id: meetingId, content, recorded_by: actor.id },
        actor.id
      );
    }

    revalidate(meetingId);
  });
}

export async function addActionItemAction(input: {
  meetingId: string;
  title: string;
  ownerId: string;
  dueDate: string;
  sourceTaskId: string;
}): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('member');

    const title = input.title.trim();
    if (!title) throw new UserError('items.titleRequired');
    requireMeetingId(input.meetingId);

    await SheetRepo.insert(
      'action_items',
      {
        meeting_id: input.meetingId,
        title,
        owner_id: input.ownerId,
        due_date: input.dueDate,
        status: 'open',
        source_task_id: input.sourceTaskId,
      },
      actor.id
    );

    revalidate(input.meetingId);
  });
}

export async function setActionItemStatusAction(
  meetingId: string,
  itemId: string,
  status: string,
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('member');
    assertItemStatus(status);

    await SheetRepo.update<ActionItemRecord>(
      'action_items',
      itemId,
      { status },
      rowVersion,
      actor.id
    );

    revalidate(meetingId);
  });
}

export async function deleteActionItemAction(
  meetingId: string,
  itemId: string,
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    // Removing someone else's assigned work is a manager call, not a member one.
    const actor = await requireRole('manager');
    await SheetRepo.delete('action_items', itemId, rowVersion, actor.id);
    revalidate(meetingId);
  });
}

/**
 * Replace the agenda with the given order of users.
 *
 * The whole list is rewritten rather than diffed: the order is only meaningful
 * as a sequence, and a partial update leaves two people holding the same slot.
 */
export async function setAgendaAction(meetingId: string, userIds: string[]): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('manager');
    requireMeetingId(meetingId);

    const all = await SheetRepo.find<MeetingAttendeeRecord>('meeting_attendees');
    const mine = all.filter((a) => a.meeting_id === meetingId);

    const seen = new Set<string>();
    const ordered = userIds.filter((id) => id && !seen.has(id) && seen.add(id));

    for (const [index, userId] of ordered.entries()) {
      const existing = mine.find((a) => a.user_id === userId);
      const present_order = index + 1;

      if (existing) {
        if (Number(existing.present_order) === present_order) continue;
        await SheetRepo.update<MeetingAttendeeRecord>(
          'meeting_attendees',
          existing.id,
          { present_order },
          existing.row_version,
          actor.id
        );
      } else {
        await SheetRepo.insert(
          'meeting_attendees',
          {
            meeting_id: meetingId,
            user_id: userId,
            attend_status: 'invited',
            present_order,
          },
          actor.id
        );
      }
    }

    // Anyone dropped from the list loses their slot but keeps their row, so an
    // attendance record taken earlier is not destroyed by an agenda edit.
    for (const row of mine) {
      if (!ordered.includes(row.user_id) && row.present_order !== '') {
        await SheetRepo.update<MeetingAttendeeRecord>(
          'meeting_attendees',
          row.id,
          { present_order: '' },
          row.row_version,
          actor.id
        );
      }
    }

    revalidate(meetingId);
  });
}

export async function setAttendStatusAction(
  meetingId: string,
  attendeeId: string,
  attendStatus: string,
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireSession();
    const allowed = ['invited', 'present', 'absent', 'excused'];
    if (!allowed.includes(attendStatus)) {
      throw new UserError('error.invalidValue', { value: attendStatus });
    }

    await SheetRepo.update<MeetingAttendeeRecord>(
      'meeting_attendees',
      attendeeId,
      { attend_status: attendStatus },
      rowVersion,
      actor.id
    );

    revalidate(meetingId);
  });
}
