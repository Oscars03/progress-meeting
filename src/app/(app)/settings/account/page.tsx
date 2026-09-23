import { SheetRepo } from '@/lib/db/sheet-repo';
import { getStoredToken, googleOAuthConfigured } from '@/lib/google/tokens';
import { requirePageSession } from '@/lib/auth-guard';
import type { UserRecord } from '@/lib/db/schema';
import CalendarCard from '../calendar-card';
import MyName from '../my-name';

/** Settings → My account: what every member sets about themselves. */
export default async function AccountSettingsPage() {
  const actor = await requirePageSession();

  // The session carries the name from whenever it was issued, so it goes stale
  // the moment somebody renames themselves. The sheet is the current answer.
  const me = await SheetRepo.findOne<UserRecord>('users', actor.id).catch(() => null);

  // Calendar status is per-person, so it is read for everyone, not just admins.
  const stored = await getStoredToken(actor.id).catch(() => null);

  return (
    <>
      <MyName name={me?.name ?? (actor.name ?? '')} email={actor.email ?? ''} />
      <CalendarCard
        status={{
          connected: Boolean(stored),
          accountEmail: stored?.accountEmail ?? '',
          connectedAt: stored?.connectedAt ?? '',
          brokeWith: stored?.lastError ?? '',
        }}
        googleEnabled={googleOAuthConfigured()}
      />
    </>
  );
}
