'use client';

import { usePrefs } from '@/lib/ui/prefs';
import type { TranslationKey } from '@/lib/ui/i18n';

export type Stat = { key: TranslationKey; value: number; tone?: string };

export default function StatCards({ stats }: { stats: Stat[] }) {
  const { t } = usePrefs();

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {stats.map((s) => (
        <div
          key={s.key}
          className="p-6 bg-white rounded-xl shadow-sm border border-gray-100"
        >
          <h3 className="text-gray-500 font-medium">{t(s.key)}</h3>
          <p className={`text-3xl font-bold mt-2 tabular-nums ${s.tone ?? ''}`}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}
