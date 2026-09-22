import { NextResponse } from 'next/server';
import { loadWidgetSummary } from '@/lib/widget-request';
import { buildTiles } from '@/lib/widget-tiles';

/**
 * One person's summary for their phone widget, as JSON -- what the iPhone
 * (Scriptable) widget draws from. Read-only: nothing a widget key can reach
 * writes anything except the key's own "last used" day.
 *
 * `tiles` is the four-tile dashboard already decided (widget-tiles.ts), so the
 * phone only lays it out; the rest stays for the text formulas and anyone
 * wanting more than four tiles show.
 */
export async function GET(request: Request) {
  const result = await loadWidgetSummary(request);
  if ('response' in result) return result.response;

  return NextResponse.json(
    { ...result.summary, tiles: buildTiles(result.summary) },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
