import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession } from '@/lib/auth-guard';
import type { MeetingRecord, TermBreakRecord, UserRecord, WeekLeadRecord } from '@/lib/db/schema';
import { activeWeekKey, planWeekLeads, rotationMembers } from '@/lib/rotation';
import { weekKey, weekStartDate } from '@/lib/week';
import { weekRange } from '@/lib/meeting-history';
import { driveStatus, type DriveStatus } from '@/lib/google/drive';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import RotationOrder, { type RotationStudent } from '../rotation-order';
import TermBreaks from '../term-breaks';
import WeekLeads, { type WeekLeadRow } from '../week-leads';
import DriveCard from '../drive-card';

/** Settings → Lab: how the lab runs -- the rotation, the breaks, where files go. Admin only. */
export default async function LabSettingsPage() {
  const [actor, t] = await Promise.all([requirePageSession(), getT()]);
  if (actor.realRole !== 'admin') redirect('/settings/account');

  // An admin looking through another role's eyes sees what that role would:
  // none of this. Said, rather than an empty page.
  if (actor.role !== 'admin') {
    return (
      <p className="p-4 rounded-lg text-sm border bg-amber-50 text-amber-900 border-amber-200">
        {t('settings.previewHidesAdmin')}{' '}
        <Link href="/settings/users" className="underline">
          {t('nav.settings.users')}
        </Link>
      </p>
    );
  }

  let rotation: RotationStudent[] = [];
  let breaks: TermBreakRecord[] = [];
  let weeks: WeekLeadRow[] = [];
  try {
    const [users, leads, meetings, locale] = await Promise.all([
      SheetRepo.find<UserRecord>('users'),
      SheetRepo.find<WeekLeadRecord>('week_leads'),
      SheetRepo.find<MeetingRecord>('meetings'),
      getLocale(),
    ]);
    breaks = await SheetRepo.find<TermBreakRecord>('term_breaks');
    rotation = rotationMembers(users).map((u) => ({ id: u.id, name: u.name }));

    // A month back, so a wrong lead that already happened can be put right,
    // and two months ahead, which is as far as anybody agrees a swap. The
    // current week is the dashboard's, so the row marked here matches it.
    const current = activeWeekKey(meetings);
    const start = new Date(`${weekStartDate(current)}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 4 * 7);
    weeks = planWeekLeads(users, leads, breaks, weekKey(start), 4 + 1 + 8).map((week) => ({
      week_key: week.week_key,
      range: weekRange(week.week_key, locale),
      user_id: week.user_id ?? '',
      name: week.name ?? '',
      confirmed: week.confirmed,
      break_name: week.break_name,
      current: week.week_key === current,
    }));
  } catch {
    // Database may not be initialised yet; the cards render empty.
  }

  // Where the lab keeps uploaded files. A Drive call, so only made here.
  const drive: DriveStatus | null = await driveStatus().catch(() => null);

  return (
    <>
      <RotationOrder students={rotation} />
      <WeekLeads rows={weeks} students={rotation} />
      <TermBreaks breaks={breaks} />
      {drive && <DriveCard status={drive} />}
    </>
  );
}
