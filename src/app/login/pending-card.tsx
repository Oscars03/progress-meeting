'use client';

import { usePrefs } from '@/lib/ui/prefs';

/**
 * What stands in the sign-in box between registering and being let in.
 *
 * It replaces the form rather than taking over the page: the brand, the header
 * and its TH/EN and theme switches stay where they were, so this reads as the
 * next state of the thing they were just using instead of somewhere they got
 * sent. Whichever language they pick, it shows one -- printing Thai and English
 * on every line doubled the height of a card whose whole message is that there
 * is nothing to do.
 *
 * Deliberately not an error. Telling someone their sign-up failed sends them
 * off to sign up again, which is the one thing that cannot help.
 */
export default function PendingCard({ onBack }: { onBack: () => void }) {
  const { t } = usePrefs();

  return (
    <div className="w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 space-y-5 text-center">
      <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto border border-amber-200">
        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      <h1 className="text-xl font-bold text-gray-900">{t('waiting.title')}</h1>

      <div className="space-y-2 text-sm text-gray-600">
        <p>{t('waiting.created')}</p>
        <p>{t('waiting.approve')}</p>
      </div>

      <button
        type="button"
        onClick={onBack}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition text-sm"
      >
        {t('waiting.checkAgain')}
      </button>
    </div>
  );
}
