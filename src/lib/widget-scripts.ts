/**
 * The iPhone widget: a script for Scriptable (a free iOS app), copied from
 * Settings and pasted into a new script there.
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
  'const ink = Color.dynamic(new Color("#111827"), new Color("#f3f4f6"));',
  'const soft = Color.dynamic(new Color("#6b7280"), new Color("#9ca3af"));',
  'const accent = Color.dynamic(new Color("#2563eb"), new Color("#60a5fa"));',
  'const warn = Color.dynamic(new Color("#dc2626"), new Color("#f87171"));',
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
  'function line(stack, text, size, color, bold) {',
  '  const t = stack.addText(text);',
  '  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);',
  '  t.textColor = color;',
  '  t.lineLimit = 1;',
  '  return t;',
  '}',
  '',
  'function heading(w, text) {',
  '  w.addSpacer(6);',
  '  line(w, text, 11, soft, true);',
  '  w.addSpacer(2);',
  '}',
  '',
  'function build(data, family) {',
  '  const w = new ListWidget();',
  '  w.url = APP + "/dashboard";',
  '  w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);',
  '  const big = family === "large";',
  '  const small = family === "small";',
  '',
  '  line(w, "ประชุมครั้งถัดไป", 11, soft, true);',
  '  if (data.meeting) {',
  '    line(w, data.meeting.when, small ? 13 : 15, ink, true);',
  '    if (!small && data.meeting.location) line(w, data.meeting.location, 12, soft, false);',
  '  } else {',
  '    line(w, "ยังไม่มีนัดประชุม", 13, soft, false);',
  '  }',
  '',
  '  if (small) {',
  '    w.addSpacer(6);',
  '    line(w, data.myPosition ? "คุณนำเสนอลำดับที่ " + data.myPosition : "ไม่มีคิวนำเสนอ", 12, data.myPosition ? accent : soft, true);',
  '    line(w, "งานค้าง " + data.tasks.length + " · โพล " + data.polls.length, 12, ink, false);',
  '    w.addSpacer();',
  '    return w;',
  '  }',
  '',
  // Medium is only about seven lines tall: one line per section, no headings,
  // so the polls line at the bottom is never cut off.
  '  if (!big) {',
  '    const me = data.presentations.filter(function (p) { return p.isMe; })[0];',
  '    w.addSpacer(6);',
  '    if (me) line(w, "▶ คุณนำเสนอลำดับที่ " + me.position + "/" + data.presentations.length + " — " + me.topics.join(", "), 12, accent, true);',
  '    else line(w, data.presentations.length ? "คุณไม่มีคิวนำเสนอ (" + data.presentations.length + " คน)" : "ยังไม่มีหัวข้อนำเสนอ", 12, soft, false);',
  '    const late = data.tasks.filter(function (t) { return t.due === "overdue"; }).length;',
  '    const first = data.tasks[0];',
  '    line(w, data.tasks.length ? "งานค้าง " + data.tasks.length + (late ? " (เลยกำหนด " + late + ")" : "") + " · " + first.title : "ไม่มีงานค้าง", 12, late ? warn : ink, late > 0);',
  '    line(w, data.polls.length ? "โพลรอคุณตอบ " + data.polls.length + " · " + data.polls[0].title : "ไม่มีโพลที่รอคุณตอบ", 12, data.polls.length ? accent : soft, false);',
  '    w.addSpacer();',
  '    return w;',
  '  }',
  '',
  '  heading(w, "ลำดับนำเสนอ");',
  '  if (!data.presentations.length) line(w, "ยังไม่มีหัวข้อนำเสนอ", 12, soft, false);',
  '  data.presentations.slice(0, 6).forEach(function (p) {',
  '    line(w, (p.isMe ? "▶ " : "") + p.position + ". " + p.name + " — " + p.topics.join(", "), 12, p.isMe ? accent : ink, p.isMe);',
  '  });',
  '',
  '  heading(w, "งานของฉัน");',
  '  if (!data.tasks.length) line(w, "ไม่มีงานค้าง", 12, soft, false);',
  '  data.tasks.slice(0, 4).forEach(function (t) {',
  '    const late = t.due === "overdue";',
  '    const due = t.dueDate ? " (" + t.dueDate.slice(0, 10) + ")" : "";',
  '    line(w, (late ? "⚠ " : "") + t.title + due, 12, late ? warn : ink, t.due === "soon" || late);',
  '  });',
  '',
  '  heading(w, "โพลรอคุณตอบ");',
  '  if (!data.polls.length) line(w, "ไม่มีโพลที่รอคุณตอบ", 12, soft, false);',
  '  data.polls.slice(0, 3).forEach(function (p) {',
  '    line(w, p.title + " — เหลือ " + p.remaining + " ช่วง", 12, accent, false);',
  '  });',
  '',
  '  w.addSpacer();',
  '  return w;',
  '}',
  '',
  'let widget;',
  'try {',
  '  widget = build(await load(), config.widgetFamily || "large");',
  '} catch (e) {',
  '  widget = new ListWidget();',
  '  line(widget, "Progress Meeting", 12, soft, true);',
  '  widget.addSpacer(4);',
  '  const t = widget.addText(String(e.message || e));',
  '  t.font = Font.systemFont(12);',
  '  t.textColor = warn;',
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
 * KWGT formulas for the Android widget, one per section. KWGT fetches a bare
 * URL, so the key rides in the query string -- see widgetKeyFrom.
 */
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
