'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import Spinner from '@/lib/ui/spinner';
import { PREVIEWABLE_VIEWS } from '@/lib/role-preview';
import { setRolePreviewAction } from './role-preview-actions';

/**
 * Look at the app as a professor or a student.
 *
 * The app shows three quite different things to three roles, and checking a
 * change against all of them meant asking somebody else to open it. This is a
 * view and not a change of role: what the admin is allowed to *do* is decided
 * by the stored role, which nothing here touches.
 */
export default function RolePreview({ current }: { current: string }) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const choose = (role: string) => {
    startTransition(async () => {
      await setRolePreviewAction(role);
      router.refresh();
    });
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-3">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{t('preview.title')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('preview.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* Admin first, as the way back, then the two roles to look through. */}
        <button
          type="button"
          disabled={isPending}
          onClick={() => choose('')}
          aria-pressed={current === 'admin'}
          className={`px-3 py-1.5 rounded-full border text-sm transition disabled:opacity-50 ${
            current === 'admin'
              ? 'bg-blue-600 border-blue-600 text-white font-medium'
              : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {t('preview.asAdmin')}
        </button>

        {PREVIEWABLE_VIEWS.map((role) => (
          <button
            key={role}
            type="button"
            disabled={isPending}
            onClick={() => choose(role)}
            aria-pressed={current === role}
            className={`px-3 py-1.5 rounded-full border text-sm transition disabled:opacity-50 ${
              current === role
                ? 'bg-blue-600 border-blue-600 text-white font-medium'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {t(`preview.as.${role}` as 'preview.as.student')}
          </button>
        ))}

        {isPending && <Spinner className="h-4 w-4 self-center" />}
      </div>

      <p className="text-xs text-gray-500">{t('preview.note')}</p>
    </div>
  );
}
