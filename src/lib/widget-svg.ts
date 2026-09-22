import type { Tile, TileTone } from './widget-tiles';

/**
 * The four tiles drawn as SVG: turned into a PNG for Android
 * (widget-png.ts), and dropped straight into Settings as a preview.
 *
 * Plain SVG rather than JSX-to-image: the image has to go through resvg, which
 * shapes Thai properly -- tone marks sitting on upper vowels (ที่, ญี่ปุ่น)
 * vanish in next/og's renderer -- and resvg reads SVG.
 *
 * Flexbox does not exist here, so everything is placed by hand on a fixed
 * canvas and long text is cut to a length that fits.
 */
export type WidgetSize = 'wide' | 'square';
export type WidgetTheme = 'light' | 'dark';

const CANVAS: Record<WidgetSize, { width: number; height: number }> = {
  wide: { width: 1000, height: 470 },
  square: { width: 1000, height: 1000 },
};

type Palette = { bg: string; text: string; sub: string; track: string; tile: Record<TileTone, { fill: string; accent: string }> };

const PALETTE: Record<WidgetTheme, Palette> = {
  light: {
    bg: '#ffffff',
    text: '#111827',
    sub: '#4b5563',
    track: '#e5e7eb',
    tile: {
      blue: { fill: '#eff6ff', accent: '#2563eb' },
      violet: { fill: '#f5f3ff', accent: '#7c3aed' },
      amber: { fill: '#fffbeb', accent: '#d97706' },
      red: { fill: '#fef2f2', accent: '#dc2626' },
      teal: { fill: '#f0fdfa', accent: '#0d9488' },
      gray: { fill: '#f3f4f6', accent: '#6b7280' },
    },
  },
  dark: {
    bg: '#0b1220',
    text: '#f9fafb',
    sub: '#cbd5e1',
    track: '#334155',
    tile: {
      blue: { fill: '#172554', accent: '#60a5fa' },
      violet: { fill: '#2e1065', accent: '#a78bfa' },
      amber: { fill: '#451a03', accent: '#fbbf24' },
      red: { fill: '#450a0a', accent: '#f87171' },
      teal: { fill: '#042f2e', accent: '#2dd4bf' },
      gray: { fill: '#1f2937', accent: '#9ca3af' },
    },
  },
};

/** 24-unit stroke icons, one per tile. */
const ICONS: Record<Tile['key'], string> = {
  meeting:
    '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4M16 3v4"/>',
  present:
    '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 21h8M7 12l3-3 3 2 4-4"/>',
  tasks:
    '<path d="M4 7l2 2 3-4M12 7h8M4 15l2 2 3-4M12 15h8"/>',
  polls:
    '<path d="M6 20v-8M12 20V6M18 20v-5M4 20h16"/>',
};

function escapeXml(text: string): string {
  return text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] as string);
}

/**
 * Cut text to roughly `max` visible characters. Thai vowels and tone marks
 * that sit above or below a letter take no width of their own, so they do not
 * count -- counting them would cut Thai far shorter than Latin.
 */
export function clip(text: string, max: number): string {
  const chars = Array.from(text);
  let visible = 0;
  for (let i = 0; i < chars.length; i++) {
    if (!/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(chars[i])) visible += 1;
    if (visible > max) return `${chars.slice(0, i).join('').trimEnd()}…`;
  }
  return text;
}

/**
 * Split sara am (ำ) into the ring and the aa it is made of, the ring ahead of
 * any tone mark.
 *
 * resvg's shaper does this split itself and gets it wrong with this font: the
 * aa loses its width, so it lands on the next letter and the space after the
 * word disappears ("นำเสนอ" drew as "นํเสนอ"). Handing it the parts already
 * in order sidesteps that. Browsers draw the split form identically, so the
 * Settings preview goes through it too.
 */
export function splitSaraAm(value: string): string {
  return value.replace(/([\u0E48-\u0E4B]?)\u0E33/g, '\u0E4D$1า');
}

function text(x: number, y: number, size: number, fill: string, value: string, opts: { weight?: number; anchor?: 'start' | 'end' } = {}) {
  return `<text x="${x}" y="${y}" font-size="${size}" font-weight="${opts.weight ?? 400}" fill="${fill}"${
    opts.anchor === 'end' ? ' text-anchor="end"' : ''
  }>${escapeXml(splitSaraAm(value))}</text>`;
}

function dots(tile: Tile, right: number, cy: number, p: Palette, accent: string): string {
  if (!tile.dots || tile.dots.count === 0) return '';
  const count = Math.min(tile.dots.count, 8);
  const r = 11;
  const step = 30;
  const start = right - (count - 1) * step - r;
  return Array.from({ length: count }, (_, i) => {
    const mine = tile.dots?.mine === i + 1;
    return `<circle cx="${start + i * step}" cy="${cy}" r="${mine ? r + 3 : r}" fill="${mine ? accent : p.track}"/>`;
  }).join('');
}

function bar(tile: Tile, x: number, y: number, width: number, p: Palette, uid: string): string {
  const b = tile.bar;
  const total = b ? b.overdue + b.soon + b.later + b.none : 0;
  const h = 14;
  let out = `<rect x="${x}" y="${y}" width="${width}" height="${h}" rx="${h / 2}" fill="${p.track}"/>`;
  if (!b || total === 0) return out;

  const parts: [number, string][] = [
    [b.overdue, p.tile.red.accent],
    [b.soon, p.tile.amber.accent],
    [b.later, p.tile.teal.accent],
    [b.none, p.tile.gray.accent],
  ];
  // Each segment clipped to the rounded track, so the ends stay round.
  out += `<clipPath id="bar-clip-${uid}"><rect x="${x}" y="${y}" width="${width}" height="${h}" rx="${h / 2}"/></clipPath><g clip-path="url(#bar-clip-${uid})">`;
  let cursor = x;
  for (const [count, color] of parts) {
    if (count === 0) continue;
    const w = (count / total) * width;
    out += `<rect x="${cursor}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`;
    cursor += w;
  }
  return `${out}</g>`;
}

function tileSvg(tile: Tile, x: number, y: number, w: number, h: number, size: WidgetSize, p: Palette, uid: string): string {
  const tone = p.tile[tile.tone];
  const pad = 26;
  const big = size === 'square';
  const valueSize = big ? 92 : 58;
  const iconR = big ? 26 : 21;
  const perChar = (fontSize: number) => Math.floor((w - pad * 2) / (fontSize * 0.56));

  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="${tone.fill}"/>`;

  // Icon disc and label.
  const cx = x + pad + iconR;
  const cy = y + pad + iconR;
  const scale = (iconR * 1.2) / 24;
  out += `<circle cx="${cx}" cy="${cy}" r="${iconR}" fill="${tone.accent}"/>`;
  out += `<g transform="translate(${cx - 12 * scale} ${cy - 12 * scale}) scale(${scale})" fill="none" stroke="${p.bg}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[tile.key]}</g>`;
  out += text(cx + iconR + 14, cy + (big ? 11 : 9), big ? 32 : 26, p.sub, tile.label, { weight: 600 });

  // The value, big, and the one line under it.
  const valueY = cy + iconR + (big ? 110 : 70);
  out += text(x + pad, valueY, valueSize, tile.quiet ? p.sub : tone.accent, tile.value, { weight: 600 });
  out += text(x + pad, valueY + (big ? 58 : 42), big ? 32 : 25, p.text, clip(tile.caption, perChar(big ? 32 : 25)));

  // Presenters as dots, tasks as a bar -- right of the value on the wide
  // image, under the caption on the square one.
  if (tile.key === 'present') {
    out += big
      ? dots(tile, x + w - pad - 3, valueY + 100, p, tone.accent)
      : dots(tile, x + w - pad - 3, valueY - 20, p, tone.accent);
  }
  if (tile.key === 'tasks') {
    out += big ? bar(tile, x + pad, valueY + 88, w - pad * 2, p, uid) : bar(tile, x + w * 0.46, valueY - 26, w * 0.54 - pad, p, uid);
  }

  if (big) {
    const top = valueY + (tile.key === 'present' || tile.key === 'tasks' ? 150 : 110);
    tile.detail.slice(0, 3).forEach((line, i) => {
      out += text(x + pad, top + i * 40, 26, p.sub, clip(line, perChar(26)));
    });
  }
  return out;
}

export function renderWidgetSvg(
  tiles: Tile[],
  options: { size?: WidgetSize; theme?: WidgetTheme; fontFamily?: string } = {},
): string {
  const size = options.size ?? 'wide';
  const theme = options.theme ?? 'light';
  const p = PALETTE[theme];
  const { width, height } = CANVAS[size];
  // Settings puts the light and dark drawings in one page, so the ids inside
  // each (the task bar's clip) must differ between them.
  const uid = `${size}-${theme}`;
  const outer = 24;
  const gap = 18;
  const w = (width - outer * 2 - gap) / 2;
  const h = (height - outer * 2 - gap) / 2;

  const body = tiles
    .slice(0, 4)
    .map((tile, i) => tileSvg(tile, outer + (i % 2) * (w + gap), outer + Math.floor(i / 2) * (h + gap), w, h, size, p, uid))
    .join('');

  const family = escapeXml(options.fontFamily ?? 'IBM Plex Sans Thai');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${family}"><rect width="${width}" height="${height}" rx="44" fill="${p.bg}"/>${body}</svg>`;
}
