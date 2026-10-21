'use client';

import { CrashPanel } from '@/lib/ui/crash-panel';

/** A page outside the app's frame that threw -- the login form, the landing page. */
export default function RootError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex-1 p-4">
      <CrashPanel {...props} />
    </main>
  );
}
