'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import Spinner from '@/lib/ui/spinner';

export default function ConnectGoogleButton() {
  // Google takes the browser away, so this is never cleared: the button stays
  // spent while the redirect is in flight, which is what stops a second press
  // starting a second consent flow.
  const [connecting, setConnecting] = useState(false);

  return (
    <button
      disabled={connecting}
      onClick={() => {
        setConnecting(true);
        // prompt=consent here, not in the provider: this is the press that
        // must come back with a refresh token, even for an account that
        // granted these scopes long ago.
        signIn('google', { callbackUrl: '/meetings' }, { prompt: 'consent' });
      }}
      className="inline-flex items-center gap-1 px-2 py-0.5 ml-2 text-xs rounded-full font-medium bg-blue-100 text-blue-700 hover:opacity-80 transition cursor-pointer border border-blue-200 disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {connecting && <Spinner className="h-3 w-3" />}
      {connecting ? 'กำลังเชื่อมต่อ...' : 'เชื่อมต่อ'}
    </button>
  );
}
