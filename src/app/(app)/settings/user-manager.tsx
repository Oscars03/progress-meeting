'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { byRoleThenName, roleStyle } from '@/lib/role-display';
import {
  initDbAction,
  clearDatabaseAction,
  updateUserPasswordAction,
  addUserAction,
  setUserActiveAction,
  updateUserRoleAction,
  updateUserNameAction,
  deleteUserAction,
} from './actions';

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  row_version: number;
  /**
   * The stored permission override, '' for anybody on their role's defaults.
   * Read by the permission table beside this one; nothing here uses it.
   */
  permissions: string;
};

type Message = { type: 'success' | 'error'; text: string };

const ROLES = [
  { value: 'student', label: 'นักศึกษา (Student)' },
  { value: 'professor', label: 'อาจารย์ (Professor)' },
  { value: 'admin', label: 'ผู้ดูแลระบบ (Admin)' },
];

const MIN_PASSWORD_LENGTH = 8;

/** Typed by hand before a wipe, so the action cannot be a single stray click. */
const CLEAR_CONFIRM_PHRASE = 'DELETE';

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function UserManager({
  initialUsers,
  loadError = false,
  populatedTabs = [],
}: {
  initialUsers: SafeUser[];
  loadError?: boolean;
  /** Tabs that already hold data; non-empty locks the db:init button. */
  populatedTabs?: string[];
}) {
  const router = useRouter();
  const { t } = usePrefs();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [draftRole, setDraftRole] = useState('');
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [showClearForm, setShowClearForm] = useState(false);
  const [clearPassword, setClearPassword] = useState('');
  const [clearConfirm, setClearConfirm] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newRole, setNewRole] = useState('student');

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

  const handleDeleteUser = (user: SafeUser) => {
    const warning = [
      `ลบ ${user.email} ถาวร กู้คืนไม่ได้`,
      'หากต้องการเพียงระงับการเข้าใช้ ให้กด "ปิดใช้งาน" แทน ซึ่งย้อนกลับได้',
      'พิมพ์อีเมลของผู้ใช้เพื่อยืนยัน:',
    ].join('\n\n');

    const typed = prompt(warning);
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      setMessage({ type: 'error', text: 'อีเมลที่พิมพ์ไม่ตรง ยกเลิกการลบแล้ว' });
      return;
    }

    run(async () => {
      const res = await deleteUserAction(user.id, user.row_version);
      setMessage({ type: 'success', text: `ลบบัญชี ${res.email} แล้ว` });
    });
  };
  // The name every other page shows this person by -- the rotation, the week's
  // lead, "[name] event" on the calendar all read the same field.
  const handleSaveName = (user: SafeUser) => {
    const next = draftName.trim();
    if (next === user.name) {
      setEditingNameId(null);
      return;
    }
    run(async () => {
      const res = await updateUserNameAction(user.id, next, user.row_version);
      if (!res.ok) {
        // A key, not a sentence -- the rest of this file predates the
        // translator and hardcodes Thai, so this one is translated properly.
        setMessage({ type: 'error', text: t(res.error, res.vars) });
        return;
      }
      setEditingNameId(null);
      setMessage({ type: 'success', text: `เปลี่ยนชื่อ ${user.name} เป็น ${next} แล้ว` });
    });
  };

  const handleSaveRole = (user: SafeUser) => {
    if (draftRole === user.role) {
      setEditingRoleId(null);
      return;
    }
    run(async () => {
      await updateUserRoleAction(user.id, draftRole, user.row_version);
      setEditingRoleId(null);
      setMessage({
        type: 'success',
        text: `เปลี่ยนสิทธิ์ของ ${user.name} เป็น ${draftRole} แล้ว`,
      });
    });
  };

  const handleSavePassword = (user: SafeUser) => {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setMessage({
        type: 'error',
        text: `รหัสผ่านต้องมีความยาวอย่างน้อย ${MIN_PASSWORD_LENGTH} ตัวอักษร`,
      });
      return;
    }
    run(async () => {
      await updateUserPasswordAction(user.id, newPassword, user.row_version);
      setEditingUserId(null);
      setNewPassword('');
      setMessage({ type: 'success', text: `ตั้งรหัสผ่านใหม่ของ ${user.name} สำเร็จแล้ว` });
    });
  };

  const handleToggleActive = (user: SafeUser) => {
    run(async () => {
      await setUserActiveAction(user.id, !user.active, user.row_version);
      setMessage({
        type: 'success',
        text: `${user.active ? 'ปิด' : 'เปิด'}การใช้งานบัญชี ${user.name} แล้ว`,
      });
    });
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      await addUserAction({
        name: newName,
        email: newEmail,
        password: newUserPassword,
        role: newRole,
      });
      setMessage({ type: 'success', text: `เพิ่มผู้ใช้ ${newName} สำเร็จ` });
      setShowAddForm(false);
      setNewName('');
      setNewEmail('');
      setNewUserPassword('');
      setNewRole('student');
    });
  };

  return (
    <div className="space-y-6">
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
            title={
              alreadyPopulated
                ? 'ปิดใช้งานเพราะชีตมีข้อมูลอยู่แล้ว'
                : undefined
            }
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
                    <label
                      className="block text-xs font-medium text-red-800 mb-1"
                      htmlFor="clear-confirm"
                    >
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
                    <label
                      className="block text-xs font-medium text-red-800 mb-1"
                      htmlFor="clear-password"
                    >
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

      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">จัดการผู้ใช้ (Users in Sheet)</h3>
            <p className="text-sm text-gray-500">
              ตั้งรหัสผ่านใหม่หรือปิดการใช้งานบัญชีได้ — รหัสผ่านถูกเก็บเป็น bcrypt hash
              จึงไม่สามารถแสดงค่าเดิมได้
            </p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-sm px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium transition whitespace-nowrap"
          >
            {showAddForm ? 'ปิดแบบฟอร์ม' : '+ เพิ่มผู้ใช้ใหม่'}
          </button>
        </div>

        {showAddForm && (
          <form
            onSubmit={handleAddUser}
            className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3"
          >
            <h4 className="font-medium text-sm text-gray-900">เพิ่มผู้ใช้ใหม่เข้า Google Sheet</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1" htmlFor="new-name">
                  ชื่อ-นามสกุล
                </label>
                <input
                  id="new-name"
                  type="text"
                  required
                  placeholder="เช่น ดร.วิทยา หรือ นายสมหวัง"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" htmlFor="new-email">
                  อีเมล
                </label>
                <input
                  id="new-email"
                  type="email"
                  required
                  placeholder="user@test.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" htmlFor="new-password">
                  รหัสผ่าน (อย่างน้อย {MIN_PASSWORD_LENGTH} ตัวอักษร)
                </label>
                <input
                  id="new-password"
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  placeholder="กำหนดรหัสผ่าน"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1" htmlFor="new-role">
                  สิทธิ์ (Role)
                </label>
                <select
                  id="new-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md"
                >
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              บันทึกผู้ใช้ลง Google Sheet
            </button>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 border-b">
              <tr>
                <th className="py-2.5 px-3">ชื่อ</th>
                <th className="py-2.5 px-3">อีเมล</th>
                <th className="py-2.5 px-3">สิทธิ์</th>
                <th className="py-2.5 px-3">สถานะ</th>
                <th className="py-2.5 px-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...initialUsers].sort(byRoleThenName).map((u) => (
                <tr key={u.id} className={roleStyle(u.role).row}>
                  <td className={`py-3 px-3 font-medium text-gray-900 border-l-4 ${roleStyle(u.role).stripe}`}>
                    {editingNameId === u.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={draftName}
                          autoFocus
                          maxLength={60}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveName(u);
                            if (e.key === 'Escape') setEditingNameId(null);
                          }}
                          aria-label={`ชื่อของ ${u.name}`}
                          className="px-2 py-1 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white w-40"
                        />
                        <button
                          onClick={() => handleSaveName(u)}
                          disabled={isPending}
                          className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50"
                        >
                          บันทึก
                        </button>
                        <button
                          onClick={() => setEditingNameId(null)}
                          className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingNameId(u.id);
                          setDraftName(u.name);
                        }}
                        title="คลิกเพื่อเปลี่ยนชื่อที่แสดง"
                        className="text-left transition hover:underline decoration-dotted underline-offset-4"
                      >
                        {u.name} <span className="text-gray-400">✎</span>
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-3 text-gray-600">{u.email}</td>
                  <td className="py-3 px-3">
                    {editingRoleId === u.id ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={draftRole}
                          onChange={(e) => setDraftRole(e.target.value)}
                          aria-label={`สิทธิ์ของ ${u.name}`}
                          className="px-2 py-1 border border-gray-300 rounded-lg text-xs text-gray-900 bg-white"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleSaveRole(u)}
                          disabled={isPending}
                          className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50"
                        >
                          บันทึก
                        </button>
                        <button
                          onClick={() => setEditingRoleId(null)}
                          className="text-xs px-2 py-1 text-gray-600 hover:text-gray-800"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingRoleId(u.id);
                          setDraftRole(u.role);
                        }}
                        title="คลิกเพื่อเปลี่ยนสิทธิ์"
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 ${roleStyle(u.role).badge}`}
                      >
                        {u.role} ✎
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <span
                      className={`text-xs font-medium ${
                        u.active ? 'text-green-700' : 'text-gray-400'
                      }`}
                    >
                      {u.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    {editingUserId === u.id ? (
                      <div className="flex items-center gap-2 justify-end">
                        <input
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="รหัสผ่านใหม่"
                          className="px-2 py-1 text-xs border rounded w-36"
                        />
                        <button
                          onClick={() => handleSavePassword(u)}
                          disabled={isPending}
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          บันทึก
                        </button>
                        <button
                          onClick={() => {
                            setEditingUserId(null);
                            setNewPassword('');
                          }}
                          className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 justify-end">
                        <button
                          onClick={() => {
                            setEditingUserId(u.id);
                            setNewPassword('');
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                        >
                          ตั้งรหัสผ่านใหม่
                        </button>
                        <button
                          onClick={() => handleToggleActive(u)}
                          disabled={isPending}
                          className="text-xs text-gray-500 hover:text-gray-800 font-medium hover:underline disabled:opacity-50"
                        >
                          {u.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u)}
                          disabled={isPending}
                          title="ลบถาวร -- ปกติควรใช้ปิดใช้งานแทน"
                          className="text-xs text-red-600 hover:text-red-800 font-medium hover:underline disabled:opacity-50"
                        >
                          ลบ
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {initialUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400">
                    {loadError
                      ? 'ยังอ่านข้อมูลผู้ใช้ไม่ได้ กรุณากดปุ่ม "⚡ รัน db:init ผ่านหน้าเว็บ" ด้านบน'
                      : 'ยังไม่มีข้อมูลผู้ใช้'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
