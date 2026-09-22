/**
 * The iPhone widget: a script for Scriptable (a free iOS app), copied from
 * Settings and pasted into a new script there.
 *
 * It draws the four tiles /api/widget already decided (lib/widget-tiles.ts),
 * natively -- SF Symbols, the phone's own font, colours that follow its light
 * or dark mode -- so the iPhone and the Android image say the same thing.
 *
 * The key is not in the script. It goes in the widget's own Parameter field,
 * so the script is the same for everybody and a screenshot of it gives nothing
 * away. The key travels in the Authorization header, which stays out of logs.
 *
 * Written as plain lines rather than a template literal: the script is
 * JavaScript too, and one stray backtick or `${` in it would be evaluated here
 * instead of on the phone.
 */
const SCRIPTABLE_LINES = [
  '// Progress Meeting — widget for Scriptable',
  '// Long-press the widget → Edit Widget → put your widget key in "Parameter".',
  '',
  'const APP = "__APP_URL__";',
  'const KEY = (args.widgetParameter || "").trim();',
  '',
  'function dyn(light, dark) { return Color.dynamic(new Color(light), new Color(dark)); }',
  'const BG = dyn("#ffffff", "#0b1220");',
  'const TEXT = dyn("#111827", "#f9fafb");',
  'const SUB = dyn("#4b5563", "#cbd5e1");',
  'const TRACK = dyn("#e5e7eb", "#334155");',
  'const TONES = {',
  '  blue: [dyn("#eff6ff", "#172554"), dyn("#2563eb", "#60a5fa")],',
  '  violet: [dyn("#f5f3ff", "#2e1065"), dyn("#7c3aed", "#a78bfa")],',
  '  amber: [dyn("#fffbeb", "#451a03"), dyn("#d97706", "#fbbf24")],',
  '  red: [dyn("#fef2f2", "#450a0a"), dyn("#dc2626", "#f87171")],',
  '  teal: [dyn("#f0fdfa", "#042f2e"), dyn("#0d9488", "#2dd4bf")],',
  '  gray: [dyn("#f3f4f6", "#1f2937"), dyn("#6b7280", "#9ca3af")],',
  '};',
  'const SYMBOLS = { meeting: "calendar", present: "person.3", tasks: "checklist", polls: "chart.bar" };',
  '',
  'async function load() {',
  '  if (!KEY) throw new Error("ใส่คีย์วิดเจ็ตในช่อง Parameter ก่อน");',
  '  const req = new Request(APP + "/api/widget");',
  '  req.headers = { Authorization: "Bearer " + KEY };',
  '  req.timeoutInterval = 20;',
  '  const data = await req.loadJSON();',
  '  const status = req.response.statusCode;',
  '  if (status === 401) throw new Error("คีย์ไม่ถูกต้อง หรือถูกยกเลิกแล้ว — สร้างใหม่ในหน้า Settings");',
  '  if (status !== 200) throw new Error("โหลดข้อมูลไม่ได้ (" + status + ")");',
  '  return data;',
  '}',
  '',
  'function label(stack, text, size, color, bold) {',
  '  const t = stack.addText(text);',
  '  t.font = bold ? Font.boldRoundedSystemFont(size) : Font.systemFont(size);',
  '  t.textColor = color;',
  '  t.lineLimit = 1;',
  '  t.minimumScaleFactor = 0.7;',
  '  return t;',
  '}',
  '',
  'function icon(stack, key, size, color) {',
  '  const img = stack.addImage(SFSymbol.named(SYMBOLS[key]).image);',
  '  img.imageSize = new Size(size, size);',
  '  img.tintColor = color;',
  '}',
  '',
  'function dots(stack, tile, accent) {',
  '  const row = stack.addStack();',
  '  row.spacing = 4;',
  '  row.centerAlignContent();',
  '  const n = Math.min(tile.dots.count, 8);',
  '  for (let i = 1; i <= n; i++) {',
  '    const mine = tile.dots.mine === i;',
  '    const d = row.addStack();',
  '    const s = mine ? 10 : 7;',
  '    d.size = new Size(s, s);',
  '    d.cornerRadius = s / 2;',
  '    d.backgroundColor = mine ? accent : TRACK;',
  '  }',
  '}',
  '',
  'function bar(stack, tile, width) {',
  '  const b = tile.bar;',
  '  const total = b.overdue + b.soon + b.later + b.none;',
  '  const track = stack.addStack();',
  '  track.size = new Size(width, 6);',
  '  track.cornerRadius = 3;',
  '  track.backgroundColor = TRACK;',
  '  if (!total) return;',
  '  const parts = [[b.overdue, TONES.red[1]], [b.soon, TONES.amber[1]], [b.later, TONES.teal[1]], [b.none, TONES.gray[1]]];',
  '  parts.forEach(function (p) {',
  '    if (!p[0]) return;',
  '    const seg = track.addStack();',
  '    seg.size = new Size(Math.max(2, (p[0] / total) * width), 6);',
  '    seg.backgroundColor = p[1];',
  '  });',
  '}',
  '',
  '// One tile. "compact" (small widget) is icon and value only.',
  'function tile(parent, t, mode) {',
  '  const tone = TONES[t.tone] || TONES.gray;',
  '  const accent = tone[1];',
  '  const box = parent.addStack();',
  '  box.layoutVertically();',
  '  box.backgroundColor = tone[0];',
  '  box.cornerRadius = mode === "compact" ? 12 : 16;',
  '  box.setPadding(mode === "compact" ? 7 : 9, 10, mode === "compact" ? 7 : 9, 10);',
  '',
  '  const head = box.addStack();',
  '  head.centerAlignContent();',
  '  icon(head, t.key, mode === "compact" ? 12 : 13, accent);',
  '  if (mode !== "compact") {',
  '    head.addSpacer(5);',
  '    label(head, t.label, 11, SUB, true);',
  '  }',
  '  head.addSpacer();',
  '',
  '  box.addSpacer(mode === "large" ? 6 : 2);',
  '  const valueRow = box.addStack();',
  '  valueRow.centerAlignContent();',
  '  label(valueRow, t.value, mode === "large" ? 30 : mode === "medium" ? 20 : 18, t.quiet ? SUB : accent, true);',
  '  valueRow.addSpacer();',
  '  if (mode !== "compact" && t.dots && t.dots.count) dots(valueRow, t, accent);',
  '',
  '  if (mode !== "compact") {',
  '    label(box, t.caption, mode === "large" ? 12 : 10, TEXT, false);',
  '  }',
  '  if (mode === "large") {',
  '    if (t.bar) { box.addSpacer(5); bar(box, t, 120); }',
  '    box.addSpacer(4);',
  '    t.detail.slice(0, 2).forEach(function (line) { label(box, line, 10, SUB, false); });',
  '  }',
  '  box.addSpacer();',
  '  return box;',
  '}',
  '',
  'function build(data, family) {',
  '  const w = new ListWidget();',
  '  w.url = APP + "/dashboard";',
  '  w.backgroundColor = BG;',
  '  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);',
  '  const mode = family === "small" ? "compact" : family === "large" ? "large" : "medium";',
  '  w.setPadding(10, 10, 10, 10);',
  '  const tiles = data.tiles;',
  '  for (let r = 0; r < 2; r++) {',
  '    const row = w.addStack();',
  '    row.spacing = 8;',
  '    tile(row, tiles[r * 2], mode);',
  '    tile(row, tiles[r * 2 + 1], mode);',
  '    if (r === 0) w.addSpacer(8);',
  '  }',
  '  return w;',
  '}',
  '',
  'let widget;',
  'try {',
  '  widget = build(await load(), config.widgetFamily || "large");',
  '} catch (e) {',
  '  widget = new ListWidget();',
  '  widget.backgroundColor = BG;',
  '  label(widget, "Progress Meeting", 12, SUB, true);',
  '  widget.addSpacer(4);',
  '  const t = widget.addText(String(e.message || e));',
  '  t.font = Font.systemFont(12);',
  '  t.textColor = TONES.red[1];',
  '  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);',
  '}',
  '',
  'if (config.runsInWidget) Script.setWidget(widget);',
  'else await widget.presentLarge();',
  'Script.complete();',
];

export function scriptableScript(appUrl: string): string {
  return SCRIPTABLE_LINES.join('\n').replace('__APP_URL__', appUrl.replace(/\/+$/, ''));
}

/**
 * The Android widget: one KWGT Image item showing /api/widget/image.
 *
 * KWGT fetches a bare URL, so the key rides in the query string -- see
 * widgetKeyFrom. `t=$df(yyMMddHH)$` is evaluated by KWGT itself and changes the
 * address once an hour; KWGT keeps a downloaded image until its address
 * changes, so without it the picture would never refresh.
 */
export function kwgtImageUrl(appUrl: string, key: string, size: 'wide' | 'square', theme: 'light' | 'dark'): string {
  return `${appUrl.replace(/\/+$/, '')}/api/widget/image?key=${encodeURIComponent(key)}&size=${size}&theme=${theme}&t=$df(yyMMddHH)$`;
}

/** Text formulas, one per section -- the plain alternative to the image. */
export function kwgtFormulas(appUrl: string, key: string): { label: string; formula: string }[] {
  const url = `${appUrl.replace(/\/+$/, '')}/api/widget?key=${encodeURIComponent(key)}`;
  const sections: [string, string][] = [
    ['meeting', 'ประชุมครั้งถัดไป'],
    ['presentations', 'ลำดับนำเสนอ'],
    ['tasks', 'งานของฉัน'],
    ['polls', 'โพลรอคุณตอบ'],
  ];
  return sections.map(([field, label]) => ({ label, formula: `$wg("${url}", json, .text.${field})$` }));
}
