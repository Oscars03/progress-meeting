import type { Metadata } from 'next';
import { getLocale, getT } from '@/lib/ui/server-i18n';
import { drawSharedWeek, findLiveShare } from '@/lib/calendar-share-data';
import { formatLabTime } from '@/lib/lab-time';

// A link handed to somebody is not something a search engine should find.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * One week of the lab's busy hours, for whoever holds the link -- outside the
 * signed-in app on purpose, so it opens for somebody with no account.
 *
 * The picture is the same SVG the download is made from, so what is seen
 * here is what is sent on.
 */
export default async function SharedWeekPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const [t, locale, share] = await Promise.all([getT(), getLocale(), findLiveShare(token)]);

  if (!share) {
    return (
      <main className="min-h-dvh bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 bg-white rounded-xl border border-gray-200 text-center space-y-2">
          <h1 className="text-lg font-semibold text-gray-900">{t('share.gone')}</h1>
          <p className="text-sm text-gray-500">{t('share.goneHint')}</p>
        </div>
      </main>
    );
  }

  const svg = await drawSharedWeek(share, t, locale);

  return (
    <main className="min-h-dvh bg-gray-50 px-4 py-6 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-500">{t('share.until', { date: formatLabTime(share.expires_at, locale) })}</p>
          <a href={`/share/${encodeURIComponent(token)}/image?download=1`} className="btn btn-primary">
            {t('share.download')}
          </a>
        </div>
        {/* Wide on purpose: seven days of bars do not survive being squeezed
            to a phone's width, so a phone scrolls it sideways instead. */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <div
            className="min-w-[760px] [&>svg]:w-full [&>svg]:h-auto"
            // Built by renderShareSvg, which escapes every piece of text in it.
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>
      </div>
    </main>
  );
}
