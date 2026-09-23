import Link from 'next/link';
import BackLink from '@/lib/ui/back-link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession } from '@/lib/auth-guard';
import { getT } from '@/lib/ui/server-i18n';
import { leadsCurrentOrLater, weeksRunBy } from '@/lib/rotation';
import { memberIds } from '@/lib/members';
import { pollIsOver } from '@/lib/poll-tally';
import type {
  AvailabilityPollRecord,
  AvailabilitySlotRecord,
  AvailabilityVoteRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';
import WeekAvailabilityGrid from './week-availability';
import { weekAvailabilityAction } from '../../calendar-actions';

export default async function PollsPage() {
  const [actor, t] = await Promise.all([
    requirePageSession(),
    getT(),
  ]);

  // The current week is read on the server so the grid arrives filled in,
  // rather than rendering empty and fetching from an effect.
  const [polls, slots, votes, leads, users, availability] = await Promise.all([
    SheetRepo.find<AvailabilityPollRecord>('availability_polls'),
    SheetRepo.find<AvailabilitySlotRecord>('availability_slots'),
    SheetRepo.find<AvailabilityVoteRecord>('availability_votes'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    SheetRepo.find<UserRecord>('users'),
    weekAvailabilityAction(),
  ]);

  const isAdmin = actor.role === 'admin';
  const leadWeeks = weeksRunBy(actor, leads);
  // Asking is the lead's job, so the page offers it to whoever leads a week.
  const canManage = isAdmin || leadWeeks.length > 0;
  // Only the students are asked to confirm a time (see pollVoters). A
  // professor sees who is free, but a list of polls marked "you have not
  // answered" asks them for something the vote would refuse.
  // An admin previewing a role sees that role's page, not admin's.
  const isVoter = actor.previewing ? actor.role === 'student' : memberIds(users).has(actor.id);
  const showPolls = canManage || isVoter;
  // Whoever schedules the coming meeting reads "schedule"; everybody else
  // comes here to see when people are free, and the heading says that.
  const schedules = isAdmin || leadsCurrentOrLater(actor, leads);

  const rows = polls
    .map((poll) => {
      const mySlots = slots.filter((s) => s.poll_id === poll.id);
      const slotIds = new Set(mySlots.map((s) => s.id));
      const pollVotes = votes.filter((v) => slotIds.has(v.slot_id));
      const iAnswered = new Set(
        pollVotes.filter((v) => v.user_id === actor.id).map((v) => v.slot_id)
      );

      return {
        poll,
        slotCount: mySlots.length,
        responderCount: new Set(pollVotes.map((v) => v.user_id)).size,
        myRemaining: mySlots.length - iAnswered.size,
      };
    })
    .sort((a, b) => b.poll.created_at.localeCompare(a.poll.created_at));

  // A poll whose every slot has ended is over whether or not anybody closed it.
  const over = (r: (typeof rows)[number]) =>
    r.poll.status === 'closed' || pollIsOver(slots.filter((s) => s.poll_id === r.poll.id));
  const open = rows.filter((r) => !over(r));
  const closed = rows.filter(over);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {schedules ? t('polls.header') : t('polls.headerSummary')}
          </h2>
          {/* Only whoever schedules needs telling what to do here; for anybody
              else the heading says it. */}
          {schedules && <p className="text-sm text-gray-500 mt-1">{t('polls.headerDesc')}</p>}
        </div>
        <div className="flex items-center gap-3">
          <BackLink href="/meetings" className="text-sm text-blue-600 hover:underline">
            {t('polls.backToCalendar')}
          </BackLink>
        </div>
      </div>

      {/* Anchored, so the dashboard's "find free time" lands on the grid
          rather than at the top of a page of polls. */}
      <div id="availability" className="scroll-mt-4">
        <WeekAvailabilityGrid initial={availability} leadWeeks={leadWeeks} isAdmin={isAdmin} />
      </div>

      {showPolls && rows.length === 0 && (
        <div className="p-8 text-center bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-gray-500 mb-2">
            {t('polls.empty')}
            <span className="text-sm">
              {canManage ? t('polls.emptyManager') : t('polls.emptyUser')}
            </span>
          </p>
        </div>
      )}

      {showPolls && open.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-600">{t('polls.openLabel')}</h3>
          <ul className="space-y-2">
            {open.map(({ poll, slotCount, responderCount, myRemaining }) => (
              <li key={poll.id}>
                <Link
                  href={`/meetings/polls/${poll.id}`}
                  className="block p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-gray-300 transition"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {myRemaining > 0 ? (
                      <span className="bg-amber-50 text-amber-800 text-xs px-2 py-0.5 rounded-full font-medium ml-auto">
                        {t('polls.myRemaining', { count: myRemaining })}
                      </span>
                    ) : (
                      <span className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium ml-auto">
                        {t('polls.myDone')}
                      </span>
                    )}
                    <span className="font-semibold text-gray-900 flex-1 min-w-48">
                      {poll.title}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {t('polls.stats', { slots: slotCount, responders: responderCount })}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {showPolls && closed.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-600">{t('polls.closedLabel')}</h3>
          <ul className="space-y-2">
            {closed.map(({ poll, slotCount, responderCount }) => (
              <li key={poll.id}>
                <Link
                  href={`/meetings/polls/${poll.id}`}
                  className="block p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-300 transition"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                      {poll.meeting_id ? t('polls.statusConfirmed') : t('polls.statusClosed')}
                    </span>
                    <span className="font-medium text-gray-700 flex-1 min-w-48">{poll.title}</span>
                    <span className="text-xs text-gray-400 tabular-nums">
                      {t('polls.stats', { slots: slotCount, responders: responderCount })}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
