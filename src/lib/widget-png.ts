import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

/**
 * SVG to PNG for the Android widget, with resvg.
 *
 * resvg because it shapes text properly: a Thai tone mark over an upper vowel
 * (ที่, ญี่ปุ่น) is positioned by the font's mark-to-mark rules, which next/og
 * does not apply -- there the mark lands inside the vowel and vanishes.
 *
 * resvg reads TrueType/OpenType but not WOFF, and IBM Plex Sans Thai (the
 * app's own font) is published only as WOFF/WOFF2. WOFF 1 is the same tables,
 * each zlib-compressed, so it is unpacked here rather than a converted copy
 * being committed.
 */
/**
 * Read by path from the project root, not through require.resolve: the
 * bundler treats a resolved .wasm or .woff as a module to compile, and fails
 * on both. next.config.ts names these files for the deployment trace, so they
 * are there at run time; @resvg/resvg-wasm is kept out of the bundle there
 * too.
 */
const fromRoot = (...parts: string[]) => join(process.cwd(), 'node_modules', ...parts);
const WASM_FILE = fromRoot('@resvg', 'resvg-wasm', 'index_bg.wasm');
const FONT_FILES = ['Regular', 'SemiBold'].map((weight) =>
  fromRoot('@ibm', 'plex-sans-thai', 'fonts', 'complete', 'woff', `IBMPlexSansThai-${weight}.woff`),
);

/** WOFF 1 → the sfnt (TTF/OTF) it wraps. */
export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString('ascii', 0, 4) !== 'wOFF') throw new Error('not a WOFF 1 file');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);

  const tables = Array.from({ length: numTables }, (_, i) => {
    const o = 44 + i * 20;
    const entry = {
      tag: woff.readUInt32BE(o),
      offset: woff.readUInt32BE(o + 4),
      compLength: woff.readUInt32BE(o + 8),
      origLength: woff.readUInt32BE(o + 12),
      checksum: woff.readUInt32BE(o + 16),
    };
    const raw = woff.subarray(entry.offset, entry.offset + entry.compLength);
    return { ...entry, data: entry.compLength < entry.origLength ? inflateSync(raw) : Buffer.from(raw) };
  });

  const headerSize = 12 + numTables * 16;
  const size = tables.reduce((sum, t) => sum + ((t.data.length + 3) & ~3), headerSize);
  const out = Buffer.alloc(size);

  let entrySelector = 0;
  while (1 << (entrySelector + 1) <= numTables) entrySelector++;
  const searchRange = (1 << entrySelector) * 16;
  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(numTables, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(numTables * 16 - searchRange, 10);

  let cursor = headerSize;
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    out.writeUInt32BE(t.tag, o);
    out.writeUInt32BE(t.checksum, o + 4);
    out.writeUInt32BE(cursor, o + 8);
    out.writeUInt32BE(t.origLength, o + 12);
    t.data.copy(out, cursor);
    cursor += (t.data.length + 3) & ~3;
  });
  return out;
}

// Loaded once per instance: the wasm and the fonts never change.
let ready: Promise<Uint8Array[]> | null = null;

function prepare(): Promise<Uint8Array[]> {
  ready ??= (async () => {
    await initWasm(await readFile(WASM_FILE));
    const fonts = await Promise.all(FONT_FILES.map((file) => readFile(file)));
    return fonts.map((woff) => new Uint8Array(woffToSfnt(woff)));
  })().catch((error) => {
    // A failed start must not be cached forever; the next request tries again.
    ready = null;
    throw error;
  });
  return ready;
}

export async function svgToPng(svg: string): Promise<Uint8Array> {
  const fontBuffers = await prepare();
  const resvg = new Resvg(svg, {
    font: { fontBuffers, loadSystemFonts: false, defaultFontFamily: 'IBM Plex Sans Thai' },
  });
  return resvg.render().asPng();
}
