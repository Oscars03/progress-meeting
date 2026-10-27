'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useModal } from '@/lib/ui/modal';
import { useConfirm } from '@/lib/ui/confirm';
import { Avatar } from '@/lib/ui/avatar';
import InfoTip from '@/lib/ui/info-tip';
import type { AvatarFace } from '@/lib/avatar-face';
import { createCalendarShareAction, revokeCalendarShareAction } from './share-actions';

export type ShareWeek = { key: string; label: string; range: string };
export type LiveShare = { id: string; week: string; people: number; until: string; rowVersion: number };

/**
 * "Share" on the calendar: pick a week and whose busy hours to show, get a
 * link that opens without signing in and a picture to send on.
 *
 * The link is shown once, as it is made -- only its hash is stored -- so the
 * list below it is of links still working, to withdraw, not to copy again.
 */
export default function ShareCalendar({
  weeks,
  thisWeek,
  people,
  shares,
  days,
}: {
  weeks: ShareWeek[];
  thisWeek: string;
  people: (AvatarFace & { id: string })[];
  shares: LiveShare[];
  days: number;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const ask = useConfirm();
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState(thisWeek);
  const [picked, setPicked] = useState<string[]>(() => people.map((p) => p.id));
  const [token, setToken] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setToken('');
    setCopied(false);
    setError('');
  };
  useModal(dialogRef, open, close);

  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/share/${token}` : '';

  const create = () => {
    setError('');
    startTransition(async () => {
      const res = await createCalendarShareAction({ weekKey: week, userIds: picked });
      if (!res.ok) {
        setError(t(res.error, res.vars));
        return;
      }
      setToken(res.token);
      setCopied(false);
      router.refresh();
    });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // No clipboard (an insecure origin, a refused permission): the link is
      // in a field the reader can select by hand.
    }
  };

  const revoke = async (share: LiveShare) => {
    // Named for what it does: "delete" would say the week goes, and beside
    // "cancel" a bare "ยกเลิก" would read as the same button twice.
    if (!(await ask(t('share.confirmRevoke', { week: share.week }), { danger: true, confirmLabel: t('share.revoke') }))) return;
    startTransition(async () => {
      const res = await revokeCalendarShareAction(share.id, share.rowVersion);
      if (!res.ok) setError(t(res.error, res.vars));
      router.refresh();
    });
  };

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-secondary">
        <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.7 10.7l6.6-3.4M8.7 13.3l6.6 3.4" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="6" r="2.5" />
          <circle cx="18" cy="18" r="2.5" />
        </svg>
        {t('share.button')}
      </button>

      {open && (
        <div className="motion-scrim fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
            className="motion-dialog bg-white rounded-2xl shadow-xl w-full max-w-xl p-5 sm:p-7 overflow-y-auto max-h-[92dvh] space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <h3 id="share-title" className="text-lg font-semibold text-gray-900">
                  {t('share.title')}
                </h3>
                <InfoTip>{t('share.intro', { days })}</InfoTip>
              </div>
              <button
                type="button"
                onClick={close}
                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label={t('weekly.close')}
              >
                <svg aria-hidden="true" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div role="alert" className="p-3 rounded-lg text-sm bg-red-50 text-red-800 border border-red-200">
                {error}
              </div>
            )}

            {token ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-700">{t('share.ready')}</p>
                <input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={t('share.copy')}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900"
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={copy} className="btn btn-primary">
                    {copied ? t('share.copied') : t('share.copy')}
                  </button>
                  <a href={url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                    {t('share.open')}
                  </a>
                  <a href={`/share/${token}/image?download=1`} className="btn btn-secondary">
                    {t('share.download')}
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div>
                  <label htmlFor="share-week" className="block text-gray-600 mb-1">
                    {t('share.week')}
                  </label>
                  <select
                    id="share-week"
                    value={week}
                    onChange={(e) => setWeek(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white"
                  >
                    {weeks.map((w) => (
                      <option key={w.key} value={w.key}>
                        {w.label} · {w.range}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span id="share-people" className="text-gray-600">
                      {t('share.people')}
                    </span>
                    <span className="flex gap-1">
                      <button type="button" onClick={() => setPicked(people.map((p) => p.id))} className="btn btn-ghost btn-sm">
                        {t('share.all')}
                      </button>
                      <button type="button" onClick={() => setPicked([])} className="btn btn-ghost btn-sm">
                        {t('share.none')}
                      </button>
                    </span>
                  </div>
                  <div role="group" aria-labelledby="share-people" className="flex flex-wrap gap-1.5">
                    {people.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="trk-pick"
                        data-role={p.role}
                        aria-pressed={picked.includes(p.id)}
                        onClick={() => toggle(p.id)}
                      >
                        <Avatar person={p} />
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={create}
                  disabled={pending || picked.length === 0}
                  className="btn btn-primary"
                >
                  {pending ? t('share.creating') : t('share.create')}
                </button>
              </div>
            )}

            <div className="pt-4 border-t border-gray-100 space-y-2">
              <h4 className="text-sm font-medium text-gray-600">{t('share.existing')}</h4>
              {shares.length === 0 ? (
                <p className="text-sm text-gray-500">{t('share.noneYet')}</p>
              ) : (
                <ul className="space-y-1.5">
                  {shares.map((s) => (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700">
                        {t('share.summary', { week: s.week, n: s.people, date: s.until })}
                      </span>
                      <button
                        type="button"
                        onClick={() => revoke(s)}
                        disabled={pending}
                        className="btn btn-danger-soft btn-sm"
                      >
                        {t('share.revoke')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
