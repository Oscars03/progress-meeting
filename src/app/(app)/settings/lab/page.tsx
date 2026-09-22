import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession } from '@/lib/auth-guard';
import type { TermBreakRecord, UserRecord } from '@/lib/db/schema';
import { rotationMembers } from '@/lib/rotation';
import { driveStatus, type DriveStatus } from '@/lib/google/drive';
import { getT } from '@/lib/ui/server-i18n';
import RotationOrder, { type RotationStudent } from '../rotation-order';
import TermBreaks from '../term-breaks';
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
  try {
    rotation = rotationMembers(await SheetRepo.find<UserRecord>('users')).map((u) => ({ id: u.id, name: u.name }));
    breaks = await SheetRepo.find<TermBreakRecord>('term_breaks');
  } catch {
    // Database may not be initialised yet; the cards render empty.
  }

  // Where the lab keeps uploaded files. A Drive call, so only made here.
  const drive: DriveStatus | null = await driveStatus().catch(() => null);

  return (
    <>
      <RotationOrder students={rotation} />
      <TermBreaks breaks={breaks} />
      {drive && <DriveCard status={drive} />}
    </>
  );
}
