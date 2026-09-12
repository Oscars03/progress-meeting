import { SheetRepo } from '@/lib/db/sheet-repo';

export default async function DashboardPage() {
  const tasks = await SheetRepo.find<any>('tasks');
  const activeTasks = tasks.filter((t: any) => t.status !== 'done');
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">ภาพรวม (Dashboard)</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 font-medium">งานทั้งหมด</h3>
          <p className="text-3xl font-bold mt-2">{tasks.length}</p>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 font-medium">งานที่ยังไม่เสร็จ</h3>
          <p className="text-3xl font-bold mt-2">{activeTasks.length}</p>
        </div>
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-gray-500 font-medium">งานที่เกินกำหนด</h3>
          <p className="text-3xl font-bold mt-2 text-red-500">
            {tasks.filter((t: any) => t.overdue_flag === true).length}
          </p>
        </div>
      </div>
    </div>
  );
}
