import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import type { MeetingRecord } from '@/lib/db/schema';
import CalendarView from './calendar';
import NewMeetingButton from './new-meeting-button';

export default async function MeetingsPage() {
  const meetings = await SheetRepo.find<MeetingRecord>('meetings');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">ปฏิทิน (Meetings)</h2>
        <div className="flex items-center gap-3">
          <Link
            href="/meetings/polls"
            className="text-sm px-3 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            หาเวลาที่ตรงกัน
          </Link>
          <NewMeetingButton />
        </div>
      </div>

      <p className="text-sm text-gray-500">คลิกที่การประชุมเพื่อเปิดวาระ บันทึกการประชุม และงานที่มอบหมาย</p>

      <CalendarView meetings={meetings} />
    </div>
  );
}
