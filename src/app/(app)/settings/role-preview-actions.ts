'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireRealAdmin } from '@/lib/auth-guard';
import { toResult, type ActionResult } from '@/lib/action-result';
import { UserError } from '@/lib/user-error';
import { ROLE_PREVIEW_COOKIE, isPreviewableRole } from '@/lib/role-preview';

/**
 * Look at the app as another role, or stop.
 *
 * `requireRealAdmin`, not `requireRole('admin')`, and that is the whole point:
 * while previewing as a student the effective role *is* student, so the
 * ordinary admin check would refuse -- and the only control that can end the
 * preview would be the one the preview had locked.
 *
 * Passing an empty role stops previewing. Nothing about the stored role is
 * touched either way; this only ever writes a cookie.
 */
export async function setRolePreviewAction(role: string): Promise<ActionResult> {
  return toResult(async () => {
    await requireRealAdmin();

    const jar = await cookies();

    if (!role) {
      jar.delete(ROLE_PREVIEW_COOKIE);
    } else {
      // Admin is not in the previewable list, so it can never be selected here
      // -- stopping is how you get back to it.
      if (!isPreviewableRole(role)) throw new UserError('error.invalidValue', { value: role });

      jar.set(ROLE_PREVIEW_COOKIE, role, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        // Deliberately a session cookie: a preview is something you do for a
        // minute, and one that outlived the browser would have an admin
        // quietly wondering for days why half the app had gone missing.
      });
    }

    // Every page renders from the role, so all of them are now out of date.
    revalidatePath('/', 'layout');
  });
}
