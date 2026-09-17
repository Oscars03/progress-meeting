'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { setRolePreviewAction } from './settings/role-preview-actions';

/**
 * A standing reminder that this is not what the app really looks like to you.
 *
 * It has to live outside the page, and it has to carry the way out. Previewing
 * as a student hides every admin-only section -- including the control on the
 * settings page that started the preview -- so without this an admin would
 * have talked themselves into a room with no handle on the inside.
 *
 * Deliberately loud. Wondering for a week why half the app has gone missing is
 * the failure mode worth spending some colour on.
 */
export default function PreviewBanner({ role }: { role: string }) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const stop = () => {
    startTransition(async () => {
      await setRolePreviewAction('');
      router.refresh();
    });
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 px-4 py-2 text-sm text-amber-900 border-b border-amber-200"
    >
      <span>
        {t('preview.banner', { role: t(`preview.as.${role}` as 'preview.as.student') })}
      </span>
      <button
        type="button"
        onClick={stop}
        disabled={isPending}
        className="font-semibold underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
      >
        {t('preview.stop')}
      </button>
    </div>
  );
}
