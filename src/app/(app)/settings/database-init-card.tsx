'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { initDbAction, clearDatabaseAction } from './actions';

type Message = { type: 'success' | 'error'; text: string };

/** Typed by hand before a wipe, so the action cannot be a single stray click. */
const CLEAR_CONFIRM_PHRASE = 'DELETE';

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

/**
 * Setting up the sheet from the browser, and wiping it to start again.
 *
 * Moved out of the user manager when Settings was split into pages: it is about
 * the database, not about people, so it lives on Settings → System. Same
 * behaviour as before -- locked while any tab holds data, and the wipe asks for
 * a typed phrase and your password.
 */
export default function DatabaseInitCard({
  populatedTabs = [],
}: {
  /** Tabs that already hold data; non-empty locks the db:init button. */
  populatedTabs?: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);
  const [showClearForm, setShowClearForm] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearConfirm, setClearConfirm] = useState('');

  const run = (work: () => Promise<void>) => {
    setMessage(null);
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } catch (err) {
        setMessage({ type: 'error', text: errorText(err, 'ดำเนินการไม่สำเร็จ') });
      }
    });
  };

  const alreadyPopulated = populatedTabs.length > 0;

  const handleInitDb = () => {
    if (alreadyPopulated) return;
    if (!confirm('ต้องการติดตั้งโครงสร้างฐานข้อมูลและเพิ่มข้อมูลทดสอบเริ่มต้นใช่หรือไม่?')) return;
    run(async () => {
      const res = await initDbAction();
      setMessage({
        type: 'success',
        text: `ติดตั้งฐานข้อมูลสำเร็จ! (สร้างข้อมูลผู้ใช้เริ่มต้น ${res.seededCount} รายการ)`,
      });
    });
  };

  const handleClearDatabase = () => {
    if (clearConfirm !== CLEAR_CONFIRM_PHRASE) {
      setMessage({ type: 'error', text: `กรุณาพิมพ์ "${CLEAR_CONFIRM_PHRASE}" ให้ตรงเพื่อยืนยัน` });
      return;
    }
    if (!clearPassword) {
      setMessage({ type: 'error', text: 'กรุณากรอกรหัสผ่านของคุณ' });
      return;
    }
    if (!confirm('ลบข้อมูลทั้งหมดถาวร กู้คืนไม่ได้ ยืนยันหรือไม่?')) return;

    run(async () => {
      const res = await clearDatabaseAction(clearPassword);
      setClearPassword('');
      setClearConfirm('');
      setShowClearForm(false);
      setMessage({
        type: 'success',
        text: `ล้างข้อมูลแล้ว ${res.clearedTabs.length} แท็บ — ปุ่ม db:init กลับมาใช้งานได้`,
      });
    });
  };

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`p-4 rounded-lg text-sm border ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border-green-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
          role="status"
        >
          {message.text}
        </div>
      )}

      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              ติดตั้งโครงสร้างฐานข้อมูล (Database Init)
            </h3>
            <p className="text-sm text-gray-500">
              สร้างแท็บ, หัวตาราง (Headers), ล็อกแถวแรก และสร้างผู้ใช้ทดสอบลงใน Google Sheets
              โดยไม่ต้องใช้ Terminal
            </p>
          </div>
          <button
            onClick={handleInitDb}
            disabled={isPending || alreadyPopulated}
            title={alreadyPopulated ? 'ปิดใช้งานเพราะชีตมีข้อมูลอยู่แล้ว' : undefined}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shadow-sm"
          >
            {isPending ? 'กำลังดำเนินการ...' : '⚡ รัน db:init ผ่านหน้าเว็บ'}
          </button>
        </div>

        {alreadyPopulated && (
          <div className="p-3 text-sm text-amber-900 bg-amber-50 rounded-lg border border-amber-200 space-y-2">
            <p className="font-medium">🔒 ล็อกไว้เพราะชีตมีข้อมูลแล้ว</p>
            <p className="mt-1 text-amber-800">
              db:init จะเขียนทับแถวหัวตารางโดยที่แถวข้อมูลข้างล่างไม่ขยับ
              ถ้าเคยแก้ลำดับคอลัมน์ไว้ ข้อมูลจะเหลื่อมคอลัมน์ทั้งตาราง
            </p>
            <p className="mt-1 text-amber-800">
              แท็บที่มีข้อมูล:{' '}
              <span className="font-mono text-xs">{populatedTabs.join(', ')}</span>
            </p>

            <div className="pt-2 border-t border-amber-200">
              {!showClearForm ? (
                <button
                  onClick={() => setShowClearForm(true)}
                  className="text-sm px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded-lg font-medium transition"
                >
                  ล้างข้อมูลทั้งหมดเพื่อปลดล็อก db:init
                </button>
              ) : (
                <div className="space-y-3 p-3 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-sm font-semibold text-red-800">
                    ⚠️ ลบข้อมูลทุกแถวในทุกแท็บอย่างถาวร กู้คืนไม่ได้
                  </p>
                  <p className="text-xs text-red-700">
                    รวมถึงบัญชีผู้ใช้ทั้งหมด หัวตารางจะยังอยู่
                    หลังล้างเสร็จให้กด db:init เพื่อสร้างบัญชีทดสอบใหม่
                    แนะนำให้สำรองชีตไว้ก่อน (ไฟล์ → ดาวน์โหลด)
                  </p>

                  <div>
                    <label className="block text-xs font-medium text-red-800 mb-1" htmlFor="clear-confirm">
                      พิมพ์ <code className="font-mono">{CLEAR_CONFIRM_PHRASE}</code> เพื่อยืนยัน
                    </label>
                    <input
                      id="clear-confirm"
                      type="text"
                      value={clearConfirm}
                      onChange={(e) => setClearConfirm(e.target.value)}
                      autoComplete="off"
                      className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm text-gray-900 bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-red-800 mb-1" htmlFor="clear-password">
                      รหัสผ่านของคุณ
                    </label>
                    <input
                      id="clear-password"
                      type="password"
                      value={clearPassword}
                      onChange={(e) => setClearPassword(e.target.value)}
                      autoComplete="current-password"
                      className="w-full px-3 py-2 border border-red-300 rounded-lg text-sm text-gray-900 bg-white"
                    />
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleClearDatabase}
                      disabled={isPending}
                      className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
                    >
                      {isPending ? 'กำลังลบ...' : 'ยืนยันล้างข้อมูล'}
                    </button>
                    <button
                      onClick={() => {
                        setShowClearForm(false);
                        setClearPassword('');
                        setClearConfirm('');
                      }}
                      className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 rounded-lg text-sm font-medium transition"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
