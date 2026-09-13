'use client';

import { signIn } from 'next-auth/react';

export default function ConnectGoogleButton() {
  return (
    <button
      onClick={() => signIn('google', { callbackUrl: '/meetings' })}
      className="inline-flex items-center gap-1 px-2 py-0.5 ml-2 text-xs rounded-full font-medium bg-blue-100 text-blue-700 hover:opacity-80 transition cursor-pointer border border-blue-200"
    >
      เชื่อมต่อ
    </button>
  );
}
