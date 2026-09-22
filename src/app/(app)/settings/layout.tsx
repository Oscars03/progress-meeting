import type { ReactNode } from 'react';
import { getT } from '@/lib/ui/server-i18n';

/**
 * Settings is five pages -- account, widget, lab, users, system -- reached
 * from the sub-menu under Settings in the sidebar (app-nav.tsx). This holds
 * what they share: the heading.
 *
 * It is also what `revalidatePath('/settings', 'layout')` in the actions
 * refreshes, which reaches every page under it at once.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const t = await getT();
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">{t('nav.settings')}</h2>
      {children}
    </div>
  );
}
