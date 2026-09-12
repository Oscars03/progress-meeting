import { SheetRepo } from '@/lib/db/sheet-repo';
import CalendarView from './calendar';

export default async function MeetingsPage() {
  const meetings = await SheetRepo.find<any>('meetings');
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">ปฏิทิน (Meetings)</h2>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
          + นัดหมายประชุม
        </button>
      </div>
      
      <CalendarView meetings={meetings} />
    </div>
  );
}
