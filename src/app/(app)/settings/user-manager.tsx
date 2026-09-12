'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  initDbAction,
  updateUserPasswordAction,
  addUserAction,
  setUserActiveAction,
} from './actions';

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  row_version: number;
};

type Message = { type: 'success' | 'error'; text: string };

const ROLES = [
  { value: 'member', label: 'สมาชิก (Member)' },
  { value: 'manager', label: 'ผู้จัดการ/อาจารย์ (Manager)' },
  { value: 'admin', label: 'ผู้ดูแลระบบ (Admin)' },
  { value: 'viewer', label: 'ผู้เข้าชม (Viewer)' },
];

const MIN_PASSWORD_LENGTH = 8;

function errorText(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export default function UserManager({
  initialUsers,
  loadError = false,
}: {
  initialUsers: SafeUser[];
  loadError?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<Message | null>(null);

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newRole, setNewRole] = useState('member');

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

  const handleInitDb = () => {
    if (!confirm('ต้องการติดตั้งโครงสร้างฐานข้อมูลและเพิ่มข้อมูลทดสอบเริ่มต้นใช่หรือไม่?')) return;
    run(async () => {
      const res = await initDbAction();
      setMessage({
        type: 'success',
        text: `ติดตั้งฐานข้อมูลสำเร็จ! (สร้างข้อมูลผู้ใช้เริ่มต้น ${res.seededCount} รายการ)`,
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
      setNewRole('member');
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
            disabled={isPending}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition disabled:opacity-50 whitespace-nowrap shadow-sm"
          >
            {isPending ? 'กำลังดำเนินการ...' : '⚡ รัน db:init ผ่านหน้าเว็บ'}
          </button>
        </div>
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
              {initialUsers.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="py-3 px-3 font-medium text-gray-900">{u.name}</td>
                  <td className="py-3 px-3 text-gray-600">{u.email}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        u.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : u.role === 'manager'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {u.role}
                    </span>
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
