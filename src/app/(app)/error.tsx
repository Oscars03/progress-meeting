'use client';

import { CrashPanel } from '@/lib/ui/crash-panel';

/** A page in the app that threw. The sidebar stays, so the way out does too. */
export default function AppError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <CrashPanel {...props} />;
}
