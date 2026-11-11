'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { usePrefs } from '@/lib/ui/prefs';
import { useToast } from '@/lib/ui/toast';
import type { ActionResult } from '@/lib/action-result';

/**
 * Run a clip action from a button: a refusal stays on screen beside the
 * control that caused it, a success says so in a toast and reloads the page's
 * data. Never a silent no.
 */
export function useClipAction() {
  const { t } = usePrefs();
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run<R extends object>(
    work: () => Promise<ActionResult<R>>,
    options?: { done?: string; after?: (result: { ok: true } & R) => void; refresh?: boolean }
  ) {
    setError(null);
    startTransition(async () => {
      const res = await work();
      if (!res.ok) {
        setError(t(res.error, res.vars));
        return;
      }
      if (options?.done) toast(options.done);
      options?.after?.(res);
      if (options?.refresh !== false) router.refresh();
    });
  }

  return { run, pending, error, setError };
}

export function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="mt-2 p-2.5 text-sm rounded-lg border bg-red-50 text-red-800 border-red-200">
      {text}
    </p>
  );
}

/** The input style used across the app's forms. */
export const FIELD = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white';
