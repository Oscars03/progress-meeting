import { getLocale, getT } from '@/lib/ui/server-i18n';
import { drawSharedWeek, findLiveShare } from '@/lib/calendar-share-data';
import { svgToPng } from '@/lib/widget-png';
import { logError } from '@/lib/app-log';

/**
 * The shared week as a PNG, for sending on in a chat. Same token, same
 * refusals and same drawing as the page.
 *
 *   ?download=1  asks the browser to save it rather than show it
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const share = await findLiveShare(token);
  if (!share) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  try {
    const [t, locale] = await Promise.all([getT(), getLocale()]);
    const png = await svgToPng(await drawSharedWeek(share, t, locale));
    const download = new URL(request.url).searchParams.get('download') === '1';
    return new Response(Buffer.from(png), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store',
        ...(download ? { 'Content-Disposition': `attachment; filename="busy-${share.week_key}.png"` } : {}),
      },
    });
  } catch (error) {
    logError('calendar_share', error, { message: 'shared week image failed', path: '/share' });
    return new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
