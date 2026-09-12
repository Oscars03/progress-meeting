import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import UserManager from './user-manager';

export default async function SettingsPage() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

  let users: any[] = [];
  try {
    const rawUsers = await SheetRepo.find<any>('users');
    users = rawUsers.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      password: u.password_hash,
      active: u.active,
      row_version: u.row_version
    }));
  } catch (err) {
    // Database might not be initialized yet
    users = [];
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-900">การตั้งค่าระบบ (Settings)</h2>
      
      {/* User Manager Component */}
      <UserManager initialUsers={users} />

      {/* Spreadsheet Direct Link Card */}
      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
        <h3 className="text-lg font-semibold border-b pb-2 text-gray-900">คลังข้อมูลต้นทาง (Spreadsheet Transparency)</h3>
        
        <div>
          <p className="text-gray-600 mb-3 text-sm">
            Google Spreadsheet เล่มหลักที่ใช้เป็นฐานข้อมูล Single Source of Truth
          </p>
          <a 
            href={sheetUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="inline-block bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 font-medium text-sm transition"
          >
            เปิดชีตต้นทาง (Google Sheets) ↗
          </a>
        </div>

        <div className="pt-3 border-t">
          <Link 
            href="/api/status" 
            target="_blank"
            className="text-sm text-blue-600 hover:underline"
          >
            ตรวจสอบสถานะระบบ คิวการเขียน และ Cache (/api/status) ↗
          </Link>
        </div>
      </div>
    </div>
  );
}
