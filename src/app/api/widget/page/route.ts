import { loadWidgetSummary } from '@/lib/widget-request';
import { buildTiles } from '@/lib/widget-tiles';
import { renderWidgetSvg, widgetBackground, type WidgetSize, type WidgetTheme } from '@/lib/widget-svg';
import { svgToPng } from '@/lib/widget-png';

/**
 * The dashboard picture as a web page, for AnyWidget on Android.
 *
 * AnyWidget makes a widget out of a web page: it loads the address and the
 * widget shows a frame cut from the top of what it drew. Handed the PNG
 * itself, the browser centres the picture on a tall black page, so the frame
 * caught black with the bottom row of tiles under it -- the owner's first try.
 * This page is nothing but the picture, flush to the top and the full width,
 * on the picture's own background, so the frame lands on the tiles as it is.
 *
 * The PNG is inlined rather than linked: one request per refresh, one key
 * check, one summary. Same key, same refusals as /api/widget/image, except
 * that they come back as a page -- the widget is the only place anybody will
 * read them, and a JSON error draws as a line of code.
 *
 *   ?size=wide|square    (default wide)
 *   ?theme=light|dark    (default light)
 */
const HEADERS = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };

function page(body: string, background: string, status = 200): Response {
  const html =
    '<!doctype html><html lang="th"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>IRiSH Progress Meeting</title>' +
    `<style>html,body{margin:0;padding:0;background:${background}}` +
    'img{display:block;width:100%;height:auto}' +
    'p{margin:0;padding:24px;font:600 20px/1.6 system-ui,"Noto Sans Thai",sans-serif;color:#b91c1c}</style>' +
    `</head><body>${body}</body></html>`;
  return new Response(html, { status, headers: HEADERS });
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const size: WidgetSize = params.get('size') === 'square' ? 'square' : 'wide';
  const theme: WidgetTheme = params.get('theme') === 'dark' ? 'dark' : 'light';
  const background = widgetBackground(theme);

  const result = await loadWidgetSummary(request);
  if ('response' in result) {
    const status = result.response.status;
    const message =
      status === 401
        ? 'คีย์วิดเจ็ตนี้ใช้ไม่ได้แล้ว — สร้างคีย์ใหม่ที่ การตั้งค่า → วิดเจ็ต แล้ววางลิงก์ใหม่'
        : 'ยังโหลดข้อมูลไม่ได้ — ลองกดรีเฟรชที่วิดเจ็ตอีกครั้ง';
    return page(`<p>${message}</p>`, background, status);
  }

  try {
    const png = await svgToPng(renderWidgetSvg(buildTiles(result.summary), { size, theme }));
    const src = `data:image/png;base64,${Buffer.from(png).toString('base64')}`;
    return page(`<img alt="" src="${src}">`, background);
  } catch (error) {
    console.error('widget page failed', error);
    return page('<p>ยังวาดวิดเจ็ตไม่ได้ — ลองกดรีเฟรชอีกครั้ง</p>', background, 503);
  }
}
