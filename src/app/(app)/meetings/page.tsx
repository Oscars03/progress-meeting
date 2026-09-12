import { SheetRepo } from '@/lib/db/sheet-repo';
import type { MeetingRecord } from '@/lib/db/schema';
import CalendarView from './calendar';
import NewMeetingButton from './new-meeting-button';

export default async function MeetingsPage() {
  const meetings = await SheetRepo.find<MeetingRecord>('meetings');

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">ปฏิทิน (Meetings)</h2>
        <NewMeetingButton />
      </div>

      <CalendarView meetings={meetings} />
    </div>
  );
}
