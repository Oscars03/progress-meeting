'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { initDatabase, getPopulatedTabs } from '@/lib/db/init-db';
import { requireRole, canAssignRole, type Role } from '@/lib/auth-guard';
import { hashPassword, validatePassword } from '@/lib/password';
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

export async function setUserActiveAction(userId: string, active: boolean, rowVersion: number) {
  const actor = await requireRole('admin');

  if (userId === actor.id && !active) {
    throw new Error('ไม่สามารถปิดการใช้งานบัญชีของตนเองได้');
  }

  await SheetRepo.update<UserRecord>('users', userId, { active }, rowVersion, actor.id);
  revalidatePath('/settings');
}
