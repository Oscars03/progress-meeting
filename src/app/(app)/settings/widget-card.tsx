'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { createWidgetKeyAction, revokeWidgetKeyAction } from './widget-actions';
import { kwgtFormulas, kwgtImageUrl } from '@/lib/widget-scripts';
import { usePrefs } from '@/lib/ui/prefs';
import type { TranslationKey } from '@/lib/ui/i18n';
import Spinner from '@/lib/ui/spinner';
import { PhoneArt, type StepArt } from './widget-illustrations';

type Status = { createdAt: string; lastUsedAt: string } | null;
type Os = 'ios' | 'android';

const IOS_STEPS: { art: StepArt; title: TranslationKey; body: TranslationKey; action?: 'store' | 'script' | 'key' }[] = [
  { art: 'ios-store', title: 'widget.ios.1.title', body: 'widget.ios.1.body', action: 'store' },
  { art: 'ios-new-script', title: 'widget.ios.2.title', body: 'widget.ios.2.body', action: 'script' },
  { art: 'ios-paste', title: 'widget.ios.3.title', body: 'widget.ios.3.body' },
  { art: 'ios-home-edit', title: 'widget.ios.4.title', body: 'widget.ios.4.body' },
  { art: 'ios-gallery', title: 'widget.ios.5.title', body: 'widget.ios.5.body' },
  { art: 'ios-edit-widget', title: 'widget.ios.6.title', body: 'widget.ios.6.body', action: 'key' },
];

const ANDROID_STEPS: { art: StepArt; title: TranslationKey; body: TranslationKey; action?: 'store' | 'image' }[] = [
  { art: 'android-store', title: 'widget.android.1.title', body: 'widget.android.1.body', action: 'store' },
  { art: 'android-home-menu', title: 'widget.android.2.title', body: 'widget.android.2.body' },
  { art: 'android-picker', title: 'widget.android.3.title', body: 'widget.android.3.body' },
  { art: 'android-add-image', title: 'widget.android.4.title', body: 'widget.android.4.body' },
  { art: 'android-bitmap', title: 'widget.android.5.title', body: 'widget.android.5.body', action: 'image' },
];

/**
 * Settings card for the phone widget: a preview of what it shows, the key
 * (make, replace, revoke), and a picture for every step of putting it on an
 * iPhone or an Android phone.
 *
 * The key exists in the browser only between pressing the button and leaving
 * the page -- the server keeps a hash -- so everything that has it inside (the
 * Android link) is shown in that window and not after.
 */
export default function WidgetCard({
  status,
  appUrl,
  script,
  preview,
}: {
  status: Status;
  appUrl: string;
  script: string;
  /** The four tiles as SVG markup, drawn from sample data on the server, in both themes. */
  preview: { light: string; dark: string };
}) {
  const { t } = usePrefs();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [os, setOs] = useState<Os>('ios');
  const [size, setSize] = useState<'wide' | 'square'>('wide');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

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

  const copyButton = (id: string, text: string, label: string = t('widget.copy'), primary = false) => (
    <button
      type="button"
      onClick={() => copy(id, text)}
      className={
        primary
          ? 'shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium'
          : 'shrink-0 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50'
      }
    >
      {copied === id ? t('widget.copied') : label}
    </button>
  );

  const needKey = <p className="text-xs text-amber-800">{t('widget.needNewKey')}</p>;

  const stepAction = (action: 'store' | 'script' | 'key' | 'image' | undefined): ReactNode => {
    if (action === 'store') {
      // Opened from a phone, these land in the store app itself.
      const store =
        os === 'ios'
          ? { href: 'https://apps.apple.com/app/scriptable/id1405459188', label: t('widget.openAppStore') }
          : { href: 'https://play.google.com/store/apps/details?id=org.kustom.widget', label: t('widget.openPlayStore') };
      return (
        <a
          href={store.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
        >
          {store.label} ↗
        </a>
      );
    }
    if (action === 'script') return copyButton('script', script, t('widget.copyScript'), true);
    if (action === 'key') return newKey ? copyButton('key-step', newKey, t('widget.copyKey'), true) : needKey;
    if (action === 'image') {
      if (!newKey) return needKey;
      const url = kwgtImageUrl(appUrl, newKey, size, theme);
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs">
            <select value={size} onChange={(e) => setSize(e.target.value as 'wide' | 'square')} className="border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-900">
              <option value="wide">{t('widget.size.wide')}</option>
              <option value="square">{t('widget.size.square')}</option>
            </select>
            <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')} className="border border-gray-300 rounded-md px-2 py-1 bg-white text-gray-900">
              <option value="light">{t('widget.theme.light')}</option>
              <option value="dark">{t('widget.theme.dark')}</option>
            </select>
          </div>
          <code className="block break-all text-[11px] bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-gray-900">{url}</code>
          {copyButton('image', url, t('widget.copyLink'), true)}
        </div>
      );
    }
    return null;
  };

  const steps = os === 'ios' ? IOS_STEPS : ANDROID_STEPS;

  return (
    <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-100 space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{t('widget.title')}</h3>
        <p className="text-sm text-gray-500 mt-1">{t('widget.hint')}</p>
      </div>

      {/* What it will look like. Sample data, so it is the same picture for
          everybody and shows every tile filled in. */}
      <figure className="space-y-2">
        {/* Markup built on the server from fixed sample data by
            renderWidgetSvg, which escapes every piece of text it places. */}
        <div
          className="widget-preview-light max-w-md rounded-2xl overflow-hidden border border-gray-200 [&>svg]:w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: preview.light }}
        />
        <div
          className="widget-preview-dark max-w-md rounded-2xl overflow-hidden border border-gray-200 [&>svg]:w-full [&>svg]:h-auto"
          dangerouslySetInnerHTML={{ __html: preview.dark }}
        />
        <figcaption className="text-xs text-gray-500">{t('widget.previewCaption')}</figcaption>
      </figure>

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

      {/* Which phone. */}
      <div role="tablist" aria-label={t('widget.pickPhone')} className="inline-flex p-1 rounded-lg bg-gray-100 gap-1">
        {(['ios', 'android'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={os === value}
            onClick={() => setOs(value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
              os === value ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {value === 'ios' ? 'iPhone' : 'Android'}
          </button>
        ))}
      </div>

      <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.art} className="rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
            <PhoneArt art={step.art} os={os} />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-gray-900">
                <span className="inline-flex items-center justify-center w-6 h-6 mr-2 rounded-full bg-blue-100 text-blue-700 text-xs">
                  {index + 1}
                </span>
                {t(step.title)}
              </p>
              <p className="text-sm text-gray-600">{t(step.body)}</p>
            </div>
            {stepAction(step.action)}
          </li>
        ))}
      </ol>

      {os === 'android' && (
        <>
          <p className="text-xs text-amber-800">{t('widget.android.logged')}</p>
          <details className="rounded-lg border border-gray-200">
            <summary className="cursor-pointer px-4 py-2.5 text-sm font-medium text-gray-700">{t('widget.android.textAlt')}</summary>
            <div className="px-4 pb-4 space-y-2 text-sm text-gray-700">
              <p className="text-gray-500">{t('widget.android.textAltHint')}</p>
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
                needKey
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
