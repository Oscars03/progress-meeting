'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { initDatabase, getPopulatedTabs } from '@/lib/db/init-db';
import { clearDatabase } from '@/lib/db/clear-db';
import { requireRole, canAssignRole, type Role } from '@/lib/auth-guard';
import { hashPassword, validatePassword, verifyPassword, isHashed } from '@/lib/password';
import type { UserRecord } from '@/lib/db/schema';

const ASSIGNABLE_ROLES: Role[] = ['admin', 'manager', 'member', 'viewer'];

/** What the client is allowed to see about a user. Never includes the password. */
export type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  row_version: number;
};

function toSafeUser(u: UserRecord): SafeUser {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    active: u.active === true,
    row_version: u.row_version,
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function initDbAction(force = false) {
  await requireRole('admin');
  const result = await initDatabase({ force });
  revalidatePath('/settings');
  return result;
}

/**
 * Wipe every data row, unlocking db:init again.
 *
 * Guarded by the caller's own password rather than a shared secret, so the
 * audit trail names a person and a stolen session alone is not enough. The
 * password is re-checked here even though the session already proved admin:
 * this is the last irreversible step in the app.
 */
export async function clearDatabaseAction(password: string) {
  const actor = await requireRole('admin');

  const me = await SheetRepo.findOne<UserRecord>('users', actor.id);
  if (!me) {
    throw new Error('ไม่พบบัญชีของคุณในฐานข้อมูล');
  }

  // Google-only accounts carry no password, so they cannot clear the database.
  if (!isHashed(me.password_hash)) {
    throw new Error(
      'บัญชีนี้เข้าสู่ระบบด้วย Google จึงไม่มีรหัสผ่านสำหรับยืนยัน ' +
        'กรุณาเข้าสู่ระบบด้วยบัญชีที่ตั้งรหัสผ่านไว้ (เช่น admin@test.com) เพื่อล้างข้อมูล'
    );
  }

  if (!(await verifyPassword(password, me.password_hash))) {
    throw new Error('รหัสผ่านไม่ถูกต้อง');
  }

  const result = await clearDatabase();
  revalidatePath('/settings');
  return result;
}

/** Tabs that already hold data, so the UI can refuse to re-run db:init. */
export async function getPopulatedTabsAction(): Promise<string[]> {
  await requireRole('admin');
  return getPopulatedTabs();
}

export async function getUsersAction(): Promise<SafeUser[]> {
  await requireRole('admin');
  const users = await SheetRepo.find<UserRecord>('users');
  return users.map(toSafeUser);
}

export async function updateUserPasswordAction(
  userId: string,
  newPassword: string,
  rowVersion: number
) {
  const actor = await requireRole('admin');

  const problem = validatePassword(newPassword);
  if (problem) throw new Error(problem);

  await SheetRepo.update<UserRecord>(
    'users',
    userId,
    { password_hash: await hashPassword(newPassword) },
    rowVersion,
    actor.id
  );

  revalidatePath('/settings');
}

export async function addUserAction(formData: {
  name: string;
  email: string;
  password: string;
  role: string;
}) {
  const actor = await requireRole('admin');

  const name = formData.name?.trim();
  const email = normalizeEmail(formData.email ?? '');
  const role = formData.role as Role;

  if (!name) throw new Error('กรุณากรอกชื่อ');
  if (!email.includes('@')) throw new Error('อีเมลไม่ถูกต้อง');
  if (!ASSIGNABLE_ROLES.includes(role)) throw new Error('สิทธิ์ที่เลือกไม่ถูกต้อง');

  // Nobody may mint an account more privileged than themselves.
  if (!canAssignRole(actor, role)) {
    throw new Error(`ไม่สามารถสร้างผู้ใช้สิทธิ์ ${role} ได้ด้วยสิทธิ์ปัจจุบัน`);
  }

  const problem = validatePassword(formData.password);
  if (problem) throw new Error(problem);

  const existing = await SheetRepo.find<UserRecord>('users');
  if (existing.some((u) => normalizeEmail(u.email) === email)) {
    throw new Error(`มีผู้ใช้อีเมล ${email} อยู่แล้ว`);
  }

  await SheetRepo.insert(
    'users',
    {
      name,
      email,
      password_hash: await hashPassword(formData.password),
      role,
      team_id: '',
      line_id: '',
      active: true,
    },
    actor.id
  );

  revalidatePath('/settings');
}

/**
 * Change a user's role.
 *
 * Four things are refused, in order of how badly they end: granting a role
 * above your own, demoting yourself, and demoting the last active admin --
 * either of the last two would leave the install with no one who can undo it.
 */
export async function updateUserRoleAction(userId: string, role: string, rowVersion: number) {
  const actor = await requireRole('admin');

  if (!ASSIGNABLE_ROLES.includes(role as Role)) {
    throw new Error(`สิทธิ์ไม่ถูกต้อง: ${role}`);
  }
  const nextRole = role as Role;

  if (!canAssignRole(actor, nextRole)) {
    throw new Error('ไม่สามารถกำหนดสิทธิ์ที่สูงกว่าสิทธิ์ของตนเองได้');
  }

  const target = await SheetRepo.findOne<UserRecord>('users', userId);
  if (!target) {
    throw new Error('ไม่พบผู้ใช้รายนี้');
  }
  if (target.role === nextRole) {
    return;
  }

  if (userId === actor.id && nextRole !== 'admin') {
    throw new Error(
      'ไม่สามารถลดสิทธิ์ของตนเองได้ — ให้ผู้ดูแลระบบคนอื่นเป็นผู้ดำเนินการแทน'
    );
  }

  // Losing the last admin locks everyone out of user management for good.
  if (target.role === 'admin') {
    const users = await SheetRepo.find<UserRecord>('users');
    const activeAdmins = users.filter((u) => u.role === 'admin' && u.active === true);
    if (activeAdmins.length <= 1) {
      throw new Error('ต้องเหลือผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 บัญชี');
    }
  }

  await SheetRepo.update<UserRecord>('users', userId, { role: nextRole }, rowVersion, actor.id);
  revalidatePath('/settings');
}

/**
 * Delete a user permanently.
 *
 * Deactivating is almost always the better move -- it keeps the row, and any
 * record that points at it, intact. Deletion is offered for rows that should
 * never have existed (a mistyped signup, a test account), so it refuses the
 * two cases that cannot be undone from inside the app: deleting yourself, and
 * deleting the last active admin.
 */
export async function deleteUserAction(userId: string, rowVersion: number) {
  const actor = await requireRole('admin');

  if (userId === actor.id) {
    throw new Error('ไม่สามารถลบบัญชีของตนเองได้');
  }

  const target = await SheetRepo.findOne<UserRecord>('users', userId);
  if (!target) {
    throw new Error('ไม่พบผู้ใช้รายนี้');
  }

  if (target.role === 'admin' && target.active === true) {
    const users = await SheetRepo.find<UserRecord>('users');
    const activeAdmins = users.filter((u) => u.role === 'admin' && u.active === true);
    if (activeAdmins.length <= 1) {
      throw new Error('ต้องเหลือผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 บัญชี');
    }
  }

  await SheetRepo.delete('users', userId, rowVersion, actor.id);
  revalidatePath('/settings');
  return { email: target.email };
}

export async function setUserActiveAction(userId: string, active: boolean, rowVersion: number) {
  const actor = await requireRole('admin');

  if (userId === actor.id && !active) {
    throw new Error('ไม่สามารถปิดการใช้งานบัญชีของตนเองได้');
  }

  await SheetRepo.update<UserRecord>('users', userId, { active }, rowVersion, actor.id);
  revalidatePath('/settings');
}
