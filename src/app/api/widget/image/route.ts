import { loadWidgetSummary } from '@/lib/widget-request';
import { buildTiles } from '@/lib/widget-tiles';
import { readWidgetSize, renderWidgetSvg, type WidgetSize, type WidgetTheme } from '@/lib/widget-svg';
import { svgToPng } from '@/lib/widget-png';

/**
 * The dashboard as a PNG, for Android: KWGT shows it with a single Image item
 * whose bitmap is this URL. Same key, same refusals, same summary as
 * /api/widget -- only drawn.
 *
 *   ?size=wide|mid|square  (default wide, 2:1 -- a 4×2 widget; see widget-svg)
 *   ?theme=light|dark    (default light)
 */
export async function GET(request: Request) {
  const result = await loadWidgetSummary(request);
  if ('response' in result) return result.response;

  const params = new URL(request.url).searchParams;
  const size: WidgetSize = readWidgetSize(params.get('size'));
  const theme: WidgetTheme = params.get('theme') === 'dark' ? 'dark' : 'light';

  try {
    const png = await svgToPng(renderWidgetSvg(buildTiles(result.summary), { size, theme }));
    return new Response(Buffer.from(png), {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('widget image failed', error);
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
