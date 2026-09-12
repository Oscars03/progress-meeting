'use server';

import { SheetRepo } from '@/lib/db/sheet-repo';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { initDatabase } from '@/lib/db/init-db';

export async function initDbAction() {
  const result = await initDatabase();
  revalidatePath('/settings');
  return result;
}

export async function getUsersAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');
  const users = await SheetRepo.find<any>('users');
  return users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    password: u.password_hash,
    active: u.active,
    row_version: u.row_version
  }));
}

export async function updateUserPasswordAction(userId: string, newPassword: string, rowVersion: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');
  
  await SheetRepo.update('users', userId, {
    password_hash: newPassword,
    row_version: rowVersion
  }, session.user.id);

  revalidatePath('/settings');
}

export async function addUserAction(formData: { name: string; email: string; password: string; role: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');

  await SheetRepo.insert('users', {
    name: formData.name,
    email: formData.email,
    password_hash: formData.password,
    role: formData.role,
    team_id: '',
    line_id: '',
    active: true
  }, session.user.id);

  revalidatePath('/settings');
}
