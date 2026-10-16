import Spinner from '@/lib/ui/spinner';
import { getT } from '@/lib/ui/server-i18n';

/**
 * Shown the moment a page in the app is opened, while the server gathers it.
 *
 * Every page here reads several tabs of the spreadsheet before it can draw,
 * which on a cold server is a few seconds -- and with nothing in its place the
 * old page simply stayed on screen, so a press looked as if it had done
 * nothing. Most noticeable straight after signing in.
 *
 * Only colours the dark theme remaps (globals.css). The language comes from
 * the cookie, which costs nothing to read.
 */
export default async function Loading() {
  const t = await getT();
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="flex items-center gap-3">
        <div className="h-7 w-40 rounded-lg bg-gray-200 animate-pulse motion-reduce:animate-none" />
        <Spinner className="h-5 w-5 text-gray-500" />
      </div>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="p-5 sm:p-6 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3"
        >
          <div className="h-4 w-32 rounded bg-gray-200 animate-pulse motion-reduce:animate-none" />
          <div className="h-6 w-3/4 rounded bg-gray-100 animate-pulse motion-reduce:animate-none" />
          <div className="h-4 w-1/2 rounded bg-gray-100 animate-pulse motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
