'use client';

import { usePrefs } from '@/lib/ui/prefs';

export default function DashboardTitle() {
  const { t } = usePrefs();
  return <h2 className="text-2xl font-bold text-gray-900">{t('dashboard.title')}</h2>;
}
