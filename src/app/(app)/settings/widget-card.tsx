'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createWidgetKeyAction, revokeWidgetKeyAction } from './widget-actions';
import { kwgtFormulas } from '@/lib/widget-scripts';
import { usePrefs } from '@/lib/ui/prefs';
import Spinner from '@/lib/ui/spinner';

type Status = { createdAt: string; lastUsedAt: string } | null;

/**
 * Settings card for the phone widget: make, replace or revoke your key, and
 * the steps to put it on an iPhone or an Android phone.
 *
 * The key exists in the browser only between pressing the button and leaving
 * the page -- the server keeps a hash -- so everything that needs it (the
 * Android formulas) is shown in that window and not after.
 */
export default function WidgetCard({
  status,
  appUrl,
  script,
}: {
  status: Status;
  appUrl: string;
  script: string;
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((current) => (current === id ? null : current)), 2000);
    } catch {
      // Clipboard refused (insecure context, permissions): the text is on
      // screen and selectable, so there is nothing more to do.
    }
  };

  const create = () => {
    if (status && !window.confirm(t('widget.replaceConfirm'))) return;
    setMessage(null);
    startTransition(async () => {
      const res = await createWidgetKeyAction();
      if (!res.ok) {
        setMessage({ kind: 'error', text: t(res.error, res.vars) });
        return;
      }
      setNewKey(res.key);
      router.refresh();
    });
  };

  const revoke = () => {
    if (!window.confirm(t('widget.revokeConfirm'))) return;
    setMessage(null);
    startTransition(async () => {
      const res = await revokeWidgetKeyAction();
      if (!res.ok) {
        setMessage({ kind: 'error', text: t(res.error, res.vars) });
        return;
      }
      setNewKey(null);
      setMessage({ kind: 'ok', text: t('widget.revoked') });
      router.refresh();
    });
  };

  const copyButton = (id: string, text: string, label = t('widget.copy')) => (
    <button
      type="button"
      onClick={() => copy(id, text)}
      className="shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      {copied === id ? t('widget.copied') : label}
    </button>
  );

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{t('widget.title')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('widget.hint')}</p>
      </div>

      {message && (
        <p
          role="status"
          className={`p-3 rounded-lg text-sm border ${
            message.kind === 'ok' ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-gray-700 flex-1 min-w-[200px]">
          {status
            ? t('widget.status', {
                created: status.createdAt.slice(0, 10),
                used: status.lastUsedAt || t('widget.neverUsed'),
              })
            : t('widget.none')}
        </p>
        <button
          type="button"
          onClick={create}
          disabled={isPending}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {isPending && <Spinner />}
          {isPending ? t('widget.working') : status ? t('widget.replace') : t('widget.create')}
        </button>
        {status && (
          <button
            type="button"
            onClick={revoke}
            disabled={isPending}
            className="px-4 py-1.5 rounded-lg border border-red-300 text-red-700 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
          >
            {t('widget.revoke')}
          </button>
        )}
      </div>

      {newKey && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
          <p className="text-sm text-amber-900">{t('widget.keyOnce')}</p>
          <div className="flex gap-2 items-center">
            <code className="flex-1 min-w-0 break-all text-xs bg-white border border-amber-200 rounded px-2 py-1.5 text-gray-900">
              {newKey}
            </code>
            {copyButton('key', newKey)}
          </div>
        </div>
      )}

      <details className="rounded-lg border border-gray-200">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-gray-800">{t('widget.iphone')}</summary>
        <ol className="list-decimal pl-9 pr-4 pb-4 space-y-2 text-sm text-gray-700">
          <li>
            {t('widget.iphone.step1')}{' '}
            <a
              href="https://apps.apple.com/app/scriptable/id1405459188"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              Scriptable ↗
            </a>
          </li>
          <li className="space-y-2">
            <span>{t('widget.iphone.step2')}</span>
            <div>{copyButton('script', script, t('widget.copyScript'))}</div>
          </li>
          <li>{t('widget.iphone.step3')}</li>
        </ol>
      </details>

      <details className="rounded-lg border border-gray-200">
        <summary className="cursor-pointer px-4 py-2.5 text-sm font-semibold text-gray-800">{t('widget.android')}</summary>
        <div className="px-4 pb-4 space-y-3 text-sm text-gray-700">
          <ol className="list-decimal pl-5 space-y-2">
            <li>
              {t('widget.android.step1')}{' '}
              <a
                href="https://play.google.com/store/apps/details?id=org.kustom.widget"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                KWGT ↗
              </a>
            </li>
            <li>{t('widget.android.step2')}</li>
            <li>{t('widget.android.step3')}</li>
          </ol>

          {newKey ? (
            <ul className="space-y-2">
              {kwgtFormulas(appUrl, newKey).map(({ label, formula }) => (
                <li key={label} className="space-y-1">
                  <span className="text-xs font-medium text-gray-600">{label}</span>
                  <div className="flex gap-2 items-center">
                    <code className="flex-1 min-w-0 break-all text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-900">
                      {formula}
                    </code>
                    {copyButton(label, formula)}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-gray-500">{t('widget.android.needKey')}</p>
          )}

          <p className="text-xs text-amber-800">{t('widget.android.logged')}</p>
        </div>
      </details>
    </div>
  );
}
