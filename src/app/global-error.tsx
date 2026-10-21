'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/client-log';

/**
 * The root layout itself threw. Nothing of it is left -- not the styles, not
 * the language setting -- so this stands alone, says it in both languages, and
 * keeps its styling inline.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    if (!error.digest) reportClientError(error, { source: 'global-boundary' });
  }, [error]);

  return (
    <html lang="th">
      <body style={{ fontFamily: 'system-ui, sans-serif', padding: 24, maxWidth: 560, margin: '0 auto', lineHeight: 1.6 }}>
        <title>IRiSH Progress Meeting</title>
        <h1 style={{ fontSize: 20 }}>เกิดข้อผิดพลาด · Something went wrong</h1>
        <p>
          ระบบบันทึกปัญหานี้ไว้ให้ผู้ดูแลระบบแล้ว ลองโหลดใหม่อีกครั้ง
          <br />
          The problem has been recorded for the admin. Please try again.
        </p>
        {error.digest && (
          <p style={{ fontSize: 13, color: '#555' }}>
            รหัสอ้างอิง · Reference: <code>{error.digest}</code>
          </p>
        )}
        <button
          type="button"
          onClick={() => retry()}
          style={{ padding: '8px 16px', borderRadius: 8, border: 0, background: '#2563eb', color: '#fff', fontSize: 15 }}
        >
          ลองใหม่ · Try again
        </button>
      </body>
    </html>
  );
}
