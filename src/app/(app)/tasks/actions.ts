'use server';

import { SheetRepo } from '@/lib/db/sheet-repo';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function updateTaskStatus(taskId: string, newStatus: string, rowVersion: number) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');
  
  await SheetRepo.update('tasks', taskId, { 
    status: newStatus,
    row_version: rowVersion
  }, session.user.id);
  
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
}

export async function createTask(data: any) {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error('Unauthorized');
  
  await SheetRepo.insert('tasks', data, session.user.id);
  revalidatePath('/tasks');
  revalidatePath('/dashboard');
}
