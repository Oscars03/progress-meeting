import { SheetRepo } from '@/lib/db/sheet-repo';
import { requirePageSession } from '@/lib/auth-guard';
import type { WidgetKeyRecord } from '@/lib/db/schema';
import { scriptableScript } from '@/lib/widget-scripts';
import { renderWidgetSvg } from '@/lib/widget-svg';
import { buildTiles } from '@/lib/widget-tiles';
import { SAMPLE_SUMMARY } from '@/lib/widget-sample';
import WidgetCard from '../widget-card';

/** Settings → Phone widget: the key and the steps for iPhone and Android. */
export default async function WidgetSettingsPage() {
  const actor = await requirePageSession();

  // Your own widget key, if you have one -- its dates only; the key itself is
  // not stored anywhere it could be read back from.
  const myWidgetKey = await SheetRepo.find<WidgetKeyRecord>('widget_keys')
    .then((rows) => rows.find((row) => row.user_id === actor.id) ?? null)
    .catch(() => null);
  // The address the phone must call. NEXTAUTH_URL is the canonical host --
  // the one proxy.ts sends every other hostname to.
  const appUrl = process.env.NEXTAUTH_URL ?? '';
  const tiles = buildTiles(SAMPLE_SUMMARY);

  return (
    <WidgetCard
      status={myWidgetKey ? { createdAt: myWidgetKey.created_at, lastUsedAt: myWidgetKey.last_used_at ?? '' } : null}
      appUrl={appUrl}
      script={scriptableScript(appUrl)}
      // The same drawing the Android image is made from, in the page's own
      // font -- the browser shapes Thai itself.
      preview={{
        light: renderWidgetSvg(tiles, { size: 'wide', theme: 'light', fontFamily: 'inherit' }),
        dark: renderWidgetSvg(tiles, { size: 'wide', theme: 'dark', fontFamily: 'inherit' }),
      }}
    />
  );
}
