'use client';

import { useState, useTransition } from 'react';
import { initDbAction, updateUserPasswordAction, addUserAction } from './actions';

export default function UserManager({ initialUsers }: { initialUsers: any[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password edit state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // New user form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newRole, setNewRole] = useState('member');

  const handleInitDb = () => {
    if (!confirm('ต้องการติดตั้งโครงสร้างฐานข้อมูลและเพิ่มข้อมูลทดสอบเริ่มต้นใช่หรือไม่?')) return;
    setMessage(null);
    startTransition(async () => {
      try {
        const res = await initDbAction();
        setMessage({ type: 'success', text: `ติดตั้งฐานข้อมูลสำเร็จ! (สร้างข้อมูลผู้ใช้เริ่มต้น ${res.seededCount} รายการ)` });
        window.location.reload();
      } catch (err: any) {
        setMessage({ type: 'error', text: err?.message || 'เกิดข้อผิดพลาดในการติดตั้งฐานข้อมูล' });
      }
    });
  };

  const handleSavePassword = (user: any) => {
    if (!newPassword) return;
    setMessage(null);
    startTransition(async () => {
      try {
        await updateUserPasswordAction(user.id, newPassword, user.row_version);
        setUsers(users.map(u => u.id === user.id ? { ...u, password: newPassword, row_version: u.row_version + 1 } : u));
        setEditingUserId(null);
        setNewPassword('');
        setMessage({ type: 'success', text: `เปลี่ยนรหัสผ่านของ ${user.name} สำเร็จแล้ว` });
      } catch (err: any) {
        setMessage({ type: 'error', text: err?.message || 'เปลี่ยนรหัสผ่านไม่สำเร็จ' });
      }
    });
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    startTransition(async () => {
      try {
        await addUserAction({
          name: newName,
          email: newEmail,
          password: newUserPassword,
          role: newRole
        });
        setMessage({ type: 'success', text: `เพิ่มผู้ใช้ ${newName} สำเร็จ` });
        setShowAddForm(false);
        setNewName('');
        setNewEmail('');
        setNewUserPassword('');
        window.location.reload();
      } catch (err: any) {
        setMessage({ type: 'error', text: err?.message || 'เพิ่มผู้ใช้ไม่สำเร็จ' });
      }
    });
  };

  return (
    <div className="space-y-6">
      {message && (
        <div className={`p-4 rounded-lg text-sm border ${message.type === 'success' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
          {message.text}
        </div>
      )}

      {/* Database Schema Init Card */}
      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">ติดตั้งโครงสร้างฐานข้อมูล (Database Init)</h3>
            <p className="text-sm text-gray-500">
              สร้างแท็บ, หัวตาราง (Headers), ล็อกแถวแรก และสร้างผู้ใช้ทดสอบลงใน Google Sheets โดยไม่ต้องใช้ Terminal
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

      {/* Users Management Card */}
      <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">จัดการผู้ใช้และรหัสผ่าน (Users in Sheet)</h3>
            <p className="text-sm text-gray-500">ดูและเปลี่ยนรหัสผ่านผู้ใช้ที่เก็บอยู่ในแท็บ `users` บน Google Sheets</p>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-sm px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg font-medium transition"
          >
            {showAddForm ? 'ปิดแบบฟอร์ม' : '+ เพิ่มผู้ใช้ใหม่'}
          </button>
        </div>

        {/* Add user form */}
        {showAddForm && (
          <form onSubmit={handleAddUser} className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
            <h4 className="font-medium text-sm text-gray-900">เพิ่มผู้ใช้ใหม่เข้า Google Sheet</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div>
                <label className="block text-gray-600 mb-1">ชื่อ-นามสกุล</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น ดร.วิทยา หรือ นายสมหวัง"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">อีเมล</label>
                <input
                  type="email"
                  required
                  placeholder="user@test.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">รหัสผ่าน</label>
                <input
                  type="text"
                  required
                  placeholder="กำหนดรหัสผ่าน"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md"
                />
              </div>
              <div>
                <label className="block text-gray-600 mb-1">สิทธิ์ (Role)</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-1.5 border rounded-md"
                >
                  <option value="member">สมาชิก (Member)</option>
                  <option value="manager">ผู้จัดการ/อาจารย์ (Manager)</option>
                  <option value="admin">ผู้ดูแลระบบ (Admin)</option>
                  <option value="viewer">ผู้เข้าชม (Viewer)</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium"
            >
              บันทึกผู้ใช้ลง Google Sheet
            </button>
          </form>
        )}

        {/* Users list table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600 border-b">
              <tr>
                <th className="py-2.5 px-3">ชื่อ</th>
                <th className="py-2.5 px-3">อีเมล</th>
                <th className="py-2.5 px-3">สิทธิ์</th>
                <th className="py-2.5 px-3">รหัสผ่าน (password_hash)</th>
                <th className="py-2.5 px-3 text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/50">
                  <td className="py-3 px-3 font-medium text-gray-900">{u.name}</td>
                  <td className="py-3 px-3 text-gray-600">{u.email}</td>
                  <td className="py-3 px-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'manager' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {editingUserId === u.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          placeholder="รหัสผ่านใหม่"
                          className="px-2 py-1 text-xs border rounded w-32"
                        />
                        <button
                          onClick={() => handleSavePassword(u)}
                          disabled={isPending}
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700"
                        >
                          บันทึก
                        </button>
                        <button
                          onClick={() => { setEditingUserId(null); setNewPassword(''); }}
                          className="px-2 py-1 bg-gray-200 text-gray-600 rounded text-xs hover:bg-gray-300"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    ) : (
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                        {u.password || '••••••••'}
                      </code>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right">
                    {editingUserId !== u.id && (
                      <button
                        onClick={() => { setEditingUserId(u.id); setNewPassword(u.password || ''); }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium hover:underline"
                      >
                        เปลี่ยนรหัสผ่าน
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-gray-400">
                    ยังไม่มีข้อมูลผู้ใช้ กรุณากดปุ่ม &quot;⚡ รัน db:init ผ่านหน้าเว็บ&quot; ด้านบน
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
