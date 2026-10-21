'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { reportView } from '../client-log';

/**
 * Notes each page a signed-in person opens, for the app log.
 *
 * Here rather than on the server because moving between pages in the app does
 * not ask the server for a page -- the layout stays, only the content changes
 * -- so the browser is the only one that knows. Renders nothing.
 */
export function UsageBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname) reportView(pathname);
  }, [pathname]);

  return null;
}
