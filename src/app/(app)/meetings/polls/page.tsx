import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requireSession } from '@/lib/auth-guard';
import type {
  AvailabilityPollRecord,
  AvailabilitySlotRecord,
  AvailabilityVoteRecord,
} from '@/lib/db/schema';
import NewPollButton from './new-poll-button';
import WeekAvailabilityGrid from './week-availability';
import { weekAvailabilityAction } from '../../calendar-actions';

export default async function PollsPage() {
  const actor = await requireSession();

  // The current week is read on the server so the grid arrives filled in,
  // rather than rendering empty and fetching from an effect.
  const [polls, slots, votes, availability] = await Promise.all([
    SheetRepo.find<AvailabilityPollRecord>('availability_polls'),
    SheetRepo.find<AvailabilitySlotRecord>('availability_slots'),
    SheetRepo.find<AvailabilityVoteRecord>('availability_votes'),
    weekAvailabilityAction(),
  ]);

  const canManage = actor.role === 'admin' || actor.role === 'manager';

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

  const open = rows.filter((r) => r.poll.status !== 'closed');
  const closed = rows.filter((r) => r.poll.status === 'closed');

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">หาเวลาที่ตรงกัน</h2>
          <p className="text-sm text-gray-500">
            เสนอหลายช่วงเวลา ให้ทุกคนกดว่าสะดวกหรือไม่ แล้วยืนยันช่วงที่ดีที่สุดเป็นการประชุม
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/meetings" className="text-sm text-blue-600 hover:underline whitespace-nowrap">
            ← ปฏิทิน
          </Link>
          {canManage && <NewPollButton />}
        </div>
      </div>

      <WeekAvailabilityGrid initial={availability} canManage={canManage} />

      {rows.length === 0 && (
        <p className="p-6 bg-white rounded-xl border border-gray-100 text-sm text-gray-400">
          ยังไม่มีโพล
          {canManage ? ' — กด "สร้างโพลใหม่" เพื่อเสนอช่วงเวลา' : ' รอผู้จัดสร้างโพล'}
        </p>
      )}

      {open.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-600">เปิดให้ตอบ</h3>
          <ul className="space-y-2">
            {open.map(({ poll, slotCount, responderCount, myRemaining }) => (
              <li key={poll.id}>
                <Link
                  href={`/meetings/polls/${poll.id}`}
                  className="block p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:border-gray-300 transition"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {myRemaining > 0 ? (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-800">
                        คุณยังไม่ตอบ {myRemaining} ช่วง
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-50 text-green-700">
                        คุณตอบครบแล้ว
                      </span>
                    )}
                    <span className="font-semibold text-gray-900 flex-1 min-w-48">
                      {poll.title}
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {slotCount} ช่วง · ตอบแล้ว {responderCount} คน
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {closed.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-600">ปิดแล้ว</h3>
          <ul className="space-y-2">
            {closed.map(({ poll, slotCount, responderCount }) => (
              <li key={poll.id}>
                <Link
                  href={`/meetings/polls/${poll.id}`}
                  className="block p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-300 transition"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                      {poll.meeting_id ? 'ยืนยันแล้ว' : 'ปิดแล้ว'}
                    </span>
                    <span className="font-medium text-gray-700 flex-1 min-w-48">{poll.title}</span>
                    <span className="text-xs text-gray-400 tabular-nums">
                      {slotCount} ช่วง · ตอบแล้ว {responderCount} คน
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
