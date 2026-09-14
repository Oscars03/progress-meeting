'use server';

import { revalidatePath } from 'next/cache';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { initDatabase, getPopulatedTabs } from '@/lib/db/init-db';
import { clearDatabase } from '@/lib/db/clear-db';
import { requireRole, canAssignRole, type Role } from '@/lib/auth-guard';
import { hashPassword, validatePassword, verifyPassword, isHashed } from '@/lib/password';
import type {
  MeetingRecord,
  TermBreakRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import { labDay, labInstant } from '@/lib/lab-time';
import { breakForWeek } from '@/lib/term-breaks';

const ASSIGNABLE_ROLES: Role[] = ['admin', 'professor', 'student'];

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
  if (problem) throw problem;

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
  if (problem) throw problem;

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

/**
 * Arrange the weekly rotation.
 *
 * Positions are written for the whole list at once: a partial write would leave
 * some students placed and others not, and the unplaced ones would silently
 * jump to the end of the queue rather than staying where the admin put them.
 */
export async function setRotationOrderAction(userIds: string[]) {
  const actor = await requireRole('admin');

  const users = await SheetRepo.find<UserRecord>('users');
  const byId = new Map(users.map((u) => [u.id, u]));

  for (const [index, id] of userIds.entries()) {
    const user = byId.get(id);
    if (!user) throw new Error(`ไม่พบผู้ใช้รายนี้: ${id}`);
    if (Number(user.rotation_order) === index + 1) continue;

    await SheetRepo.update<UserRecord>(
      'users',
      id,
      { rotation_order: index + 1 },
      user.row_version,
      actor.id
    );
  }

  revalidatePath('/settings');
  revalidatePath('/dashboard');
}

/**
 * Declare a stretch of term break.
 *
 * Reports failure as a value rather than throwing: a thrown message is redacted
 * in production, so validation written as `throw new Error('...')` reaches the
 * reader as "an unexpected error occurred" — and these messages were hardcoded
 * Thai besides, which the English half of the UI does not want.
 */
export async function addTermBreakAction(
  name: string,
  start_date: string,
  end_date: string
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('admin');

    const trimmedName = name.trim();
    if (!trimmedName) throw new UserError('termBreaks.error.nameRequired');
    if (!start_date || !end_date) throw new UserError('termBreaks.error.datesRequired');
    if (end_date < start_date) throw new UserError('termBreaks.error.endBeforeStart');

    // Two breaks over the same days make "which break is this?" unanswerable,
    // and the calendar would shade the day twice for no extra meaning.
    const existing = await SheetRepo.find<TermBreakRecord>('term_breaks');
    const clash = existing.find((b) => start_date <= b.end_date && end_date >= b.start_date);
    if (clash) throw new UserError('termBreaks.error.overlaps', { name: clash.name });

    // A break declared over weeks that are already spoken for does not undo
    // them -- it is refused, so nobody's meeting quietly becomes unreachable.
    const [meetings, leads] = await Promise.all([
      SheetRepo.find<MeetingRecord>('meetings'),
      SheetRepo.find<WeekLeadRecord>('week_leads'),
    ]);

    const scheduled = meetings.find((m) => {
      if (m.status === 'cancelled' || !m.start_at) return false;
      const start = labInstant(m.start_at);
      if (!start) return false;
      const day = labDay(start);
      return day >= start_date && day <= end_date;
    });
    if (scheduled) throw new UserError('termBreaks.error.hasMeeting', { name: scheduled.title });

    const proposed = [{ name: trimmedName, start_date, end_date } as TermBreakRecord];
    const heldWeek = leads.find((lead) => breakForWeek(proposed, lead.week_key));
    if (heldWeek) throw new UserError('termBreaks.error.hasLead', { week: heldWeek.week_key });

    await SheetRepo.insert(
      'term_breaks',
      { name: trimmedName, start_date, end_date },
      actor.id
    );

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    revalidatePath('/meetings');
  });
}

export async function deleteTermBreakAction(id: string, rowVersion: number): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('admin');
    await SheetRepo.delete('term_breaks', id, rowVersion, actor.id);

    revalidatePath('/settings');
    revalidatePath('/dashboard');
    revalidatePath('/meetings');
  });
}

/**
 * Change the name a person is shown as.
 *
 * Names arrive from whatever Google had on the account, or from whatever
 * somebody typed when registering, and the rotation, the week's lead and every
 * "[name] event" on the calendar read from this one field. Admin owns it for
 * the same reason it owns roles: the name is how everyone else identifies you,
 * not a personal preference.
 */
export async function updateUserNameAction(
  userId: string,
  name: string,
  rowVersion: number
): Promise<ActionResult> {
  return toResult(async () => {
    const actor = await requireRole('admin');

    const trimmed = name.trim().replace(/\s+/g, ' ');
    if (!trimmed) throw new UserError('users.error.nameRequired');
    if (trimmed.length > 60) throw new UserError('users.error.nameTooLong');

    const target = await SheetRepo.findOne<UserRecord>('users', userId);
    if (!target) throw new UserError('error.notFound');
    if (target.name === trimmed) return;

    await SheetRepo.update<UserRecord>('users', userId, { name: trimmed }, rowVersion, actor.id);

    // The name is read on every page that names anybody.
    revalidatePath('/settings');
    revalidatePath('/dashboard');
    revalidatePath('/meetings');
    revalidatePath('/presentations');
    revalidatePath('/tasks');
  });
}
