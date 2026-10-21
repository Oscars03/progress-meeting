'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateMyFaceAction } from './actions';
import { usePrefs } from '@/lib/ui/prefs';
import { useToast } from '@/lib/ui/toast';
import { Avatar } from '@/lib/ui/avatar';
import Spinner from '@/lib/ui/spinner';
import { AVATAR_COLORS, MAX_NICKNAME, type AvatarFace } from '@/lib/avatar-face';

/**
 * Your avatar, chosen by you: a nickname for its letter and one of twelve
 * colours. The preview is the real Avatar, ring and all, so what is saved is
 * what the lab will see.
 */
export default function MyFace({ face }: { face: AvatarFace }) {
  const { t } = usePrefs();
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [nickname, setNickname] = useState(face.nickname);
  const [color, setColor] = useState(face.color);
  const [error, setError] = useState<string | null>(null);

  const unchanged = nickname.trim() === face.nickname && color === face.color;
  const preview = { ...face, nickname: nickname.trim(), color };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await updateMyFaceAction(nickname, color);
      if (!res.ok) {
        setError(t(res.error, res.vars));
        return;
      }
      toast(t('common.saved'));
      router.refresh();
    });
  };

  const swatch = (value: string, label: string, fill: string) => (
    <button
      key={value || 'auto'}
      type="button"
      onClick={() => setColor(value)}
      aria-pressed={color === value}
      aria-label={label}
      title={label}
      className={`h-8 w-8 rounded-full grid place-items-center text-[10px] font-semibold transition ${
        color === value ? '' : 'hover:scale-110'
      }`}
      // The selected ring is drawn with the theme's own surface and accent, so
      // the gap round it is the card's colour in dark mode as well as light.
      style={{
        background: `var(--${fill}-bg)`,
        color: `var(--${fill}-ink)`,
        boxShadow: color === value ? '0 0 0 2px var(--trk-surface), 0 0 0 4px var(--trk-accent)' : undefined,
      }}
    >
      {value ? '' : 'A'}
    </button>
  );

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div className="flex items-start gap-4">
        <span className="mt-1">
          <Avatar person={preview} large />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-gray-900">{t('myFace.title')}</h3>
          <p className="text-xs text-gray-500 mt-0.5">{t('myFace.hint')}</p>
        </div>
      </div>

      {error && (
        <p className="p-3 rounded-lg text-sm border bg-red-50 text-red-800 border-red-200" role="alert">
          {error}
        </p>
      )}

      <form onSubmit={save} className="space-y-4">
        <div className="max-w-xs">
          <label className="block text-xs font-medium text-gray-700 mb-1" htmlFor="my-nickname">
            {t('myFace.nickname')}
          </label>
          <input
            id="my-nickname"
            type="text"
            maxLength={MAX_NICKNAME}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder={t('myFace.nicknamePlaceholder')}
            autoComplete="nickname"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white"
          />
        </div>

        <div>
          <span className="block text-xs font-medium text-gray-700 mb-2">{t('myFace.color')}</span>
          <div role="group" aria-label={t('myFace.color')} className="flex flex-wrap gap-2.5">
            {swatch('', t('myFace.auto'), `trk-av${face.tone}`)}
            {AVATAR_COLORS.map((c) => swatch(c, t('myFace.colorName', { color: c }), `av-${c}`))}
          </div>
        </div>

        <button
          type="submit"
          disabled={isPending || unchanged}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg transition text-sm font-medium h-[34px] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending && <Spinner className="h-4 w-4" />}
          {t('common.save')}
        </button>
      </form>
    </div>
  );
}
