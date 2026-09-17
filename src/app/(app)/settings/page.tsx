import Link from 'next/link';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { getPopulatedTabs } from '@/lib/db/init-db';
import { getConnectedUserIds, getStoredToken, googleOAuthConfigured } from '@/lib/google/tokens';
import CalendarCard from './calendar-card';
import DriveCard from './drive-card';
import RolePreview from './role-preview';
import { driveStatus, type DriveStatus } from '@/lib/google/drive';
import { requireSession } from '@/lib/auth-guard';
import type { UserRecord } from '@/lib/db/schema';
import UserManager, { type SafeUser } from './user-manager';
import RotationOrder, { type RotationStudent } from './rotation-order';
import TermBreaks from './term-breaks';
import MyName from './my-name';
import { rotationMembers } from '@/lib/rotation';
import { labMembers } from '@/lib/members';
import type { TermBreakRecord } from '@/lib/db/schema';

export default async function SettingsPage() {
  const actor = await requireSession();
  const isAdmin = actor.role === 'admin';

  let users: SafeUser[] = [];
  let rotation: RotationStudent[] = [];
  let breaks: TermBreakRecord[] = [];
  let loadError = false;
  let populatedTabs: string[] = [];

  // The session carries the name from whenever it was issued, so it goes stale
  // the moment somebody renames themselves. The sheet is the current answer.
  const me = await SheetRepo.findOne<UserRecord>('users', actor.id).catch(() => null);

  // Calendar status is per-person, so it is read for everyone, not just admins.
  const stored = await getStoredToken(actor.id).catch(() => null);
  let connectedCount = 0;
  let activeCount = 0;
  let allUsers: UserRecord[] = [];
  try {
    const connected = await getConnectedUserIds();
    allUsers = await SheetRepo.find<UserRecord>('users');
    const active = labMembers(allUsers);
    activeCount = active.length;
    connectedCount = active.filter((u) => connected.has(u.id)).length;
  } catch {
    // The card still renders; it just cannot report group coverage.
  }

  // Where the lab keeps uploaded files. Admin-only, so it is not read for
  // anybody else -- it is a Drive call, and nobody else can act on the answer.
  let drive: DriveStatus | null = null;
  if (isAdmin) {
    drive = await driveStatus().catch(() => null);
  }

  if (isAdmin) {
    try {
      const rawUsers = allUsers.length > 0 ? allUsers : await SheetRepo.find<UserRecord>('users');
      users = rawUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active === true,
        row_version: u.row_version,
      }));
      rotation = rotationMembers(rawUsers).map((u) => ({ id: u.id, name: u.name }));
      breaks = await SheetRepo.find<TermBreakRecord>('term_breaks');
    } catch {
      // Database may not be initialised yet.
      loadError = true;
    }

    try {
      populatedTabs = await getPopulatedTabs();
    } catch {
      // Cannot reach the sheet: leave the button enabled rather than locking
      // the one control that repairs an uninitialised database.
      populatedTabs = [];
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-2xl font-bold text-gray-900">การตั้งค่าระบบ (Settings)</h2>

      {/* First, because it is the only thing here every member can act on. */}
      <MyName name={me?.name ?? (actor.name ?? '')} email={actor.email ?? ''} />

      {/* On realRole, not isAdmin: previewing as a student makes isAdmin
          false, and gating this on that would hide the only control that can
          end the preview from inside Settings. */}
      {actor.realRole === 'admin' && <RolePreview current={actor.role} />}

      <CalendarCard
        status={{
          connected: Boolean(stored),
          accountEmail: stored?.accountEmail ?? '',
          connectedAt: stored?.connectedAt ?? '',
          brokeWith: stored?.lastError ?? '',
        }}
        googleEnabled={googleOAuthConfigured()}
        connectedCount={connectedCount}
        activeCount={activeCount}
      />

      {isAdmin && drive && <DriveCard status={drive} />}

      {isAdmin && <RotationOrder students={rotation} />}

      {isAdmin && <TermBreaks breaks={breaks} />}

      {isAdmin ? (
        <UserManager initialUsers={users} loadError={loadError} populatedTabs={populatedTabs} />
      ) : (
        <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">จัดการผู้ใช้</h3>
          <p className="text-sm text-gray-500 mt-1">
            ต้องมีสิทธิ์ผู้ดูแลระบบ (admin) จึงจะจัดการผู้ใช้ได้ — สิทธิ์ปัจจุบันของคุณคือ{' '}
            <code className="bg-gray-100 px-1.5 py-0.5 rounded">{actor.role}</code>
          </p>
        </div>
      )}

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
          <p className="text-gray-600 text-sm">
            ลิงก์ไปยังชีตต้นทางแสดงเฉพาะผู้ดูแลระบบเท่านั้น
          </p>
        )}

        <div className="pt-3 border-t">
          <Link href="/api/status" target="_blank" className="text-sm text-blue-600 hover:underline">
            ตรวจสอบสถานะระบบ คิวการเขียน และ Cache (/api/status) ↗
          </Link>
        </div>
      </div>
    </div>
  );
}
