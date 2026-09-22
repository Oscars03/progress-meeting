import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPopulatedTabs } from '@/lib/db/init-db';
import { requirePageSession } from '@/lib/auth-guard';
import DatabaseInitCard from '../database-init-card';

/**
 * Settings → System: where the data lives and whether the app is healthy.
 * The admin's alone -- the source sheet and setting up the database are the
 * whole of it -- so anybody else, including an admin previewing another role,
 * is sent to their own settings rather than shown a page of "admin only".
 */
export default async function SystemSettingsPage() {
  const actor = await requirePageSession();
  if (actor.role !== 'admin') redirect('/settings/account');

  // Cannot reach the sheet: leave the button enabled rather than locking
  // the one control that repairs an uninitialised database.
  const populatedTabs = await getPopulatedTabs().catch((): string[] => []);

  return (
    <>
      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2 text-gray-900">
          คลังข้อมูลต้นทาง (Spreadsheet Transparency)
        </h3>

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

        <div className="pt-3 border-t">
          <Link href="/api/status" target="_blank" className="text-sm text-blue-600 hover:underline">
            ตรวจสอบสถานะระบบ คิวการเขียน และ Cache (/api/status) ↗
          </Link>
        </div>
      </div>

      <DatabaseInitCard populatedTabs={populatedTabs} />
    </>
  );
}
