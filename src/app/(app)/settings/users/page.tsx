import { redirect } from 'next/navigation';
import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession } from '@/lib/auth-guard';
import type { UserRecord } from '@/lib/db/schema';
import { storedJson } from '@/lib/permissions';
import { getT } from '@/lib/ui/server-i18n';
import UserManager, { type SafeUser } from '../user-manager';
import PermissionTable from '../permission-table';
import RolePreview from '../role-preview';

/**
 * Settings → Users and permissions: who is in the lab, what they may do, and
 * looking at the app as another role. Admin only.
 */
export default async function UsersSettingsPage() {
  const [actor, t] = await Promise.all([requirePageSession(), getT()]);
  if (actor.realRole !== 'admin') redirect('/settings/account');
  const isAdmin = actor.role === 'admin';

  let users: SafeUser[] = [];
  let loadError = false;
  if (isAdmin) {
    try {
      users = (await SheetRepo.find<UserRecord>('users')).map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active === true,
        row_version: u.row_version,
        permissions: storedJson(u.permissions),
      }));
    } catch {
      // Database may not be initialised yet -- UserManager says so.
      loadError = true;
    }
  }

  return (
    <>
      {/* On realRole, not isAdmin: previewing as a student makes isAdmin
          false, and gating this on that would hide the only control that can
          end the preview. The view, not the role: the lead view is a student
          who holds the week, so the role alone could not tell the two apart. */}
      <RolePreview current={actor.previewingLead ? 'lead' : actor.role} />

      {isAdmin ? (
        <>
          <UserManager initialUsers={users} loadError={loadError} />
          {/* The other half of the same question: the role a person holds,
              and the exceptions to it. */}
          {!loadError && <PermissionTable users={users} />}
        </>
      ) : (
        <p className="p-4 rounded-lg text-sm border bg-amber-50 text-amber-900 border-amber-200">
          {t('settings.previewHidesAdmin')}
        </p>
      )}
    </>
  );
}
