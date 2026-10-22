import { SheetRepo } from '@/lib/db/sheet-repo';
import { getStoredToken, googleOAuthConfigured } from '@/lib/google/tokens';
import { requirePageSession } from '@/lib/auth-guard';
import type { UserRecord } from '@/lib/db/schema';
import CalendarCard from '../calendar-card';
import MyName from '../my-name';
import MyFace from '../my-face';
import { assignColors, faceOf, takenColors } from '@/lib/avatar-face';

/** Settings → My account: what every member sets about themselves. */
export default async function AccountSettingsPage() {
  const actor = await requirePageSession();

  // The session carries the name from whenever it was issued, so it goes stale
  // the moment somebody renames themselves. The sheet is the current answer.
  const users = await SheetRepo.find<UserRecord>('users').catch(() => [] as UserRecord[]);
  const me = users.find((u) => u.id === actor.id) ?? null;
  // The colour "automatic" would give: the one assigned to them if they had
  // not chosen, which is what the lab sees until they do.
  const autoColor =
    assignColors(users.map((u) => (u.id === actor.id ? { ...u, avatar_color: '' } : u))).get(actor.id) ?? '';

  // Calendar status is per-person, so it is read for everyone, not just admins.
  const stored = await getStoredToken(actor.id).catch(() => null);

  return (
    <>
      <MyName name={me?.name ?? (actor.name ?? '')} email={actor.email ?? ''} />
      <MyFace
        face={faceOf(me ?? { id: actor.id, name: actor.name ?? '', role: actor.role })}
        autoColor={autoColor}
        taken={takenColors(users, actor.id)}
      />
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
