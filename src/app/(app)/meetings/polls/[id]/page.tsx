import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession, hasManagerRights } from '@/lib/auth-guard';
import { getT } from '@/lib/ui/server-i18n';
import { tallySlot, rankSlots, bestSlot, type Choice } from '@/lib/poll-tally';
import type {
  AvailabilityPollRecord,
  AvailabilitySlotRecord,
  AvailabilityVoteRecord,
  UserRecord,
} from '@/lib/db/schema';
import PollGrid, { type SlotView } from './poll-grid';

export default async function PollDetailPage(props: PageProps<'/meetings/polls/[id]'>) {
  const { id } = await props.params;
  const [actor, t] = await Promise.all([requireSession(), getT()]);

  const [polls, slots, votes, users] = await Promise.all([
    SheetRepo.find<AvailabilityPollRecord>('availability_polls'),
    SheetRepo.find<AvailabilitySlotRecord>('availability_slots'),
    SheetRepo.find<AvailabilityVoteRecord>('availability_votes'),
    SheetRepo.find<UserRecord>('users'),
  ]);

  const poll = polls.find((p) => p.id === id);
  if (!poll) notFound();

  const activeUsers = users.filter((u) => u.active === true);
  const nameById = new Map(activeUsers.map((u) => [u.id, u.name] as const));

  const mySlots = slots
    .filter((s) => s.poll_id === id)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));

  const tallies = mySlots.map((slot) => {
    const byUser = new Map<string, Choice>();
    for (const vote of votes) {
      if (vote.slot_id !== slot.id) continue;
      const choice = vote.choice as Choice;
      if (choice === 'yes' || choice === 'maybe' || choice === 'no') {
        byUser.set(vote.user_id, choice);
      }
    }
    return { slot, byUser, tally: tallySlot(slot.id, byUser, activeUsers.length) };
  });

  const recommended = bestSlot(tallies.map((t) => t.tally));
  const ranked = rankSlots(tallies.map((t) => t.tally));
  const rankById = new Map(ranked.map((t, i) => [t.slotId, i + 1] as const));

  const slotViews: SlotView[] = tallies.map(({ slot, byUser, tally }) => ({
    id: slot.id,
    startAt: slot.start_at,
    endAt: slot.end_at,
    yes: tally.yes,
    maybe: tally.maybe,
    no: tally.no,
    pending: tally.pending,
    everyoneCanMake: tally.everyoneCanMake,
    rank: rankById.get(slot.id) ?? 0,
    isRecommended: recommended?.slotId === slot.id,
    myChoice: byUser.get(actor.id) ?? null,
    responders: [...byUser.entries()].map(([userId, choice]) => ({
      name: nameById.get(userId) ?? t('agenda.deletedUser'),
      choice,
    })),
  }));

  const canManage = hasManagerRights(actor.role);
  const closed = poll.status === 'closed';

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="space-y-1">
        <Link href="/meetings/polls" className="text-sm text-blue-600 hover:underline">
          {t('polls.backToList')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-gray-900">{poll.title}</h2>
          {closed && (
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
              {poll.meeting_id ? t('polls.statusConfirmed') : poll.status === 'closed' ? t('polls.statusClosedResponse') : t('polls.openLabel')}
            </span>
          )}
        </div>
        {poll.note && <p className="text-sm text-gray-500">{poll.note}</p>}
        <p className="text-sm text-gray-500">
          {t('polls.activeUsers', { count: activeUsers.length })}
        </p>
      </div>

      {poll.meeting_id && (
        <p className="text-sm font-medium text-green-700 bg-green-50 px-4 py-3 rounded-lg border border-green-200">
          {t('polls.confirmedMsg')}
          <Link href={`/meetings/${poll.meeting_id}`} className="underline hover:text-green-900">
            {t('polls.openMeeting')}
          </Link>
        </p>
      )}

      <PollGrid
        pollId={id}
        pollRowVersion={poll.row_version}
        slots={slotViews}
        canManage={canManage}
        closed={closed}
        alreadyConfirmed={Boolean(poll.meeting_id)}
      />
    </div>
  );
}
