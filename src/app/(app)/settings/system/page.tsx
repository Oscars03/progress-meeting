import Link from 'next/link';
import { getPopulatedTabs } from '@/lib/db/init-db';
import { requirePageSession } from '@/lib/auth-guard';
import DatabaseInitCard from '../database-init-card';

/**
 * Settings → System: where the data lives and whether the app is healthy.
 * Everybody can see the status page; the source sheet and setting up the
 * database are the admin's.
 */
export default async function SystemSettingsPage() {
  const actor = await requirePageSession();
  const isAdmin = actor.role === 'admin';

  let populatedTabs: string[] = [];
  if (isAdmin) {
    // Cannot reach the sheet: leave the button enabled rather than locking
    // the one control that repairs an uninitialised database.
    populatedTabs = await getPopulatedTabs().catch(() => []);
  }

  return (
    <>
      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2 text-gray-900">
          คลังข้อมูลต้นทาง (Spreadsheet Transparency)
        </h3>

        {isAdmin ? (
          <div>
            <p className="text-gray-600 mb-3 text-sm">
              Google Spreadsheet เล่มหลักที่ใช้เป็นฐานข้อมูล Single Source of Truth
            </p>
            <a
              href={`https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium text-sm transition"
            >
              เปิดชีตต้นทาง (Google Sheets) ↗
            </a>
          </div>
        ) : (
          <p className="text-gray-600 text-sm">ลิงก์ไปยังชีตต้นทางแสดงเฉพาะผู้ดูแลระบบเท่านั้น</p>
        )}

        <div className="pt-3 border-t">
          <Link href="/api/status" target="_blank" className="text-sm text-blue-600 hover:underline">
            ตรวจสอบสถานะระบบ คิวการเขียน และ Cache (/api/status) ↗
          </Link>
        </div>
      </div>

      {isAdmin && <DatabaseInitCard populatedTabs={populatedTabs} />}
    </>
  );
}
