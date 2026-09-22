/**
 * Drawn phone screens for the widget set-up steps, each with a marker on the
 * one thing to press.
 *
 * Drawings rather than screenshots: they cannot go out of date when Apple or
 * Google move a button, and they carry their own fixed colours -- a phone is
 * a dark object on either theme -- so none of this needs the dark-mode
 * utility list in globals.css.
 */
import { useId, type ReactNode } from 'react';

const FRAME = '#1f2937';
const SCREEN = '#f8fafc';
const INK = '#334155';
const LINE = '#cbd5e1';
const BLUE = '#2563eb';
const GREEN = '#16a34a';

export type StepArt =
  | 'ios-store'
  | 'ios-new-script'
  | 'ios-paste'
  | 'ios-home-edit'
  | 'ios-gallery'
  | 'ios-edit-widget'
  | 'android-store'
  | 'android-home-menu'
  | 'android-picker'
  | 'android-explore'
  | 'kwgt-editor'
  | 'kwgt-add-menu'
  | 'kwgt-items'
  | 'kwgt-bitmap'
  | 'kwgt-formula'
  | 'kwgt-width'
  | 'kwgt-touch-link'
  | 'kwgt-add-global'
  | 'kwgt-flow'
  | 'kwgt-touch-flow';

/**
 * Where to press: a ring around it, hollow so the thing being pressed stays
 * readable -- a filled dot covered exactly the label it pointed at.
 * `hold` adds a dashed outer ring for a long-press.
 */
function Tap({ x, y, hold = false, r = 11, n }: { x: number; y: number; hold?: boolean; r?: number; n?: number }) {
  return (
    <g>
      {hold && <circle cx={x} cy={y} r={r + 5} fill="none" stroke={BLUE} strokeWidth={1.2} strokeDasharray="3 2" />}
      <circle cx={x} cy={y} r={r} fill={BLUE} fillOpacity={0.1} stroke={BLUE} strokeWidth={1.8} />
      {n !== undefined && <Order n={n} x={x - r * 0.75} y={y + r * 0.75} />}
    </g>
  );
}

/** The same, for something wide -- a button or a field -- outlined rather than ringed. */
function TapBox({ x, y, w, h, hold = false, n }: { x: number; y: number; w: number; h: number; hold?: boolean; n?: number }) {
  const m = 3;
  return (
    <g>
      {hold && <rect x={x - m - 4} y={y - m - 4} width={w + (m + 4) * 2} height={h + (m + 4) * 2} rx={(h + 14) / 2} fill="none" stroke={BLUE} strokeWidth={1.2} strokeDasharray="3 2" />}
      <rect x={x - m} y={y - m} width={w + m * 2} height={h + m * 2} rx={(h + m * 2) / 2} fill="none" stroke={BLUE} strokeWidth={1.8} />
      {n !== undefined && <Order n={n} x={x - m} y={y - m} />}
    </g>
  );
}

/** Which press comes first, where a step has two. */
function Order({ n, x, y }: { n: number; x: number; y: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={4.2} fill={BLUE} stroke="#ffffff" strokeWidth={0.8} />
      <text x={x} y={y + 2} fontSize={5.5} fontWeight={700} fill="#ffffff" textAnchor="middle">{n}</text>
    </g>
  );
}

function Bar({ x, y, w, h = 4, fill = LINE }: { x: number; y: number; w: number; h?: number; fill?: string }) {
  return <rect x={x} y={y} width={w} height={h} rx={h / 2} fill={fill} />;
}

function Label({ x, y, children, fill = INK, size = 7, weight = 500, anchor }: { x: number; y: number; children: ReactNode; fill?: string; size?: number; weight?: number; anchor?: 'middle' | 'end' }) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} textAnchor={anchor}>
      {children}
    </text>
  );
}

/** The four tiles in miniature -- what the widget will look like. */
function MiniWidget({ x, y, w }: { x: number; y: number; w: number }) {
  const h = w * 0.47;
  const g = 3;
  const tw = (w - g * 3) / 2;
  const th = (h - g * 3) / 2;
  const tones = ['#dbeafe', '#ede9fe', '#fee2e2', '#ccfbf1'];
  const accents = ['#2563eb', '#7c3aed', '#dc2626', '#0d9488'];
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={7} fill="#ffffff" stroke={LINE} strokeWidth={0.6} />
      {tones.map((fill, i) => (
        <g key={fill}>
          <rect x={x + g + (i % 2) * (tw + g)} y={y + g + Math.floor(i / 2) * (th + g)} width={tw} height={th} rx={4} fill={fill} />
          <rect x={x + g + (i % 2) * (tw + g) + 4} y={y + g + Math.floor(i / 2) * (th + g) + th - 9} width={tw * 0.35} height={5} rx={2} fill={accents[i]} />
        </g>
      ))}
    </g>
  );
}

function Screen({ art }: { art: StepArt }) {
  switch (art) {
    case 'ios-store':
    case 'android-store': {
      const ios = art === 'ios-store';
      return (
        <>
          <Bar x={20} y={26} w={40} h={5} fill={INK} />
          <rect x={20} y={44} width={30} height={30} rx={7} fill={ios ? '#111827' : '#7c3aed'} />
          <Label x={35} y={63} fill="#ffffff" size={12} weight={600} anchor="middle">{ios ? 'S' : 'K'}</Label>
          <Label x={56} y={55} size={7.5}>{ios ? 'Scriptable' : 'KWGT'}</Label>
          <Bar x={56} y={60} w={34} h={3} />
          <rect x={56} y={66} width={34} height={12} rx={6} fill={ios ? BLUE : GREEN} />
          <Label x={73} y={74.5} fill="#ffffff" size={6.5} anchor="middle">{ios ? 'รับ' : 'ติดตั้ง'}</Label>
          {[92, 104, 116, 128].map((y) => <Bar key={y} x={20} y={y} w={y % 24 ? 70 : 56} h={3} />)}
          <TapBox x={56} y={66} w={34} h={12} />
        </>
      );
    }
    case 'ios-new-script':
      return (
        <>
          <Label x={20} y={36} size={9} weight={600}>Scriptable</Label>
          <Label x={97} y={36} fill={BLUE} size={14} weight={400} anchor="middle">+</Label>
          {[52, 80, 108].map((y, i) => (
            <g key={y}>
              <rect x={18} y={y} width={40} height={22} rx={5} fill={['#fde68a', '#bfdbfe', '#fecaca'][i]} />
              <rect x={62} y={y} width={40} height={22} rx={5} fill={['#bbf7d0', '#e9d5ff', '#e2e8f0'][i]} />
            </g>
          ))}
          <Tap x={97} y={32} r={9} />
        </>
      );
    case 'ios-paste':
      return (
        <>
          <Label x={18} y={33} fill={BLUE} size={7}>Done</Label>
          <rect x={40} y={25} width={60} height={12} rx={3} fill="#e0e7ff" />
          <Label x={70} y={33.5} size={6.5} anchor="middle">Progress Meeting</Label>
          {[50, 58, 66, 74, 82, 90, 98, 106, 114, 122].map((y, i) => (
            <Bar key={y} x={18 + (i % 3) * 6} y={y} w={[70, 52, 60, 44, 66][i % 5]} h={3} fill={i % 4 ? LINE : '#a5b4fc'} />
          ))}
          <rect x={30} y={140} width={46} height={16} rx={5} fill={INK} />
          <Label x={53} y={150.5} fill="#ffffff" size={6.5} anchor="middle">วาง (Paste)</Label>
          <TapBox x={40} y={25} w={60} h={12} />
        </>
      );
    case 'ios-home-edit':
      return (
        <>
          <rect x={16} y={24} width={16} height={12} rx={6} fill="#e2e8f0" />
          <Label x={24} y={33} size={10} weight={500} anchor="middle">+</Label>
          <rect x={80} y={24} width={24} height={12} rx={6} fill="#e2e8f0" />
          <Label x={92} y={32.5} size={6} anchor="middle">เสร็จ</Label>
          {Array.from({ length: 16 }, (_, i) => (
            <rect key={i} x={20 + (i % 4) * 22} y={48 + Math.floor(i / 4) * 26} width={15} height={15} rx={4} fill={['#fca5a5', '#93c5fd', '#86efac', '#fcd34d', '#c4b5fd'][i % 5]} />
          ))}
          <Label x={60} y={168} size={6.5} anchor="middle">แตะค้างที่ว่าง → กด +</Label>
          <Tap x={24} y={30} hold />
        </>
      );
    case 'ios-gallery':
    case 'android-picker': {
      const ios = art === 'ios-gallery';
      return (
        <>
          <rect x={9} y={52} width={102} height={156} rx={12} fill="#ffffff" />
          <Label x={60} y={68} size={7.5} weight={600} anchor="middle">{ios ? 'Scriptable' : 'KWGT  4×2'}</Label>
          <MiniWidget x={22} y={80} w={76} />
          <g>
            <circle cx={54} cy={126} r={2} fill={INK} />
            <circle cx={60} cy={126} r={2} fill={LINE} />
            <circle cx={66} cy={126} r={2} fill={LINE} />
          </g>
          <rect x={26} y={140} width={68} height={16} rx={8} fill={ios ? BLUE : GREEN} />
          <Label x={60} y={150.5} fill="#ffffff" size={6.5} anchor="middle">{ios ? '+ เพิ่มวิดเจ็ต' : 'ลากไปวาง'}</Label>
          <TapBox x={26} y={140} w={68} h={16} hold={!ios} />
        </>
      );
    }
    case 'ios-edit-widget':
      return (
        <>
          <MiniWidget x={22} y={26} w={76} />
          {/* Only the two rows that are set here; "When Interacting" is left
              at its default, and drawing it crowded the others. */}
          <rect x={14} y={76} width={92} height={84} rx={9} fill="#ffffff" stroke={LINE} strokeWidth={0.6} />
          <Label x={22} y={92} size={6.5} fill="#64748b">Script</Label>
          <rect x={20} y={97} width={80} height={12} rx={3} fill="#e0e7ff" />
          <Label x={24} y={105.5} size={6.5} fill={BLUE}>Progress Meeting</Label>
          <line x1={20} x2={100} y1={117} y2={117} stroke={LINE} strokeWidth={0.6} />
          <Label x={22} y={130} size={6.5} fill="#64748b">Parameter</Label>
          <rect x={20} y={136} width={80} height={12} rx={3} fill="#fef3c7" stroke="#f59e0b" strokeWidth={0.8} />
          <Label x={24} y={144.5} size={6.5} fill={INK}>pmw_••••••••</Label>
          <TapBox x={20} y={136} w={80} h={12} />
        </>
      );
    case 'android-home-menu':
      return (
        <>
          {Array.from({ length: 8 }, (_, i) => (
            <rect key={i} x={20 + (i % 4) * 22} y={30 + Math.floor(i / 4) * 26} width={15} height={15} rx={8} fill={['#fca5a5', '#93c5fd', '#86efac', '#fcd34d'][i % 4]} />
          ))}
          <rect x={30} y={96} width={62} height={58} rx={9} fill="#ffffff" stroke={LINE} strokeWidth={0.6} />
          <Label x={40} y={112} size={6.5}>วอลเปเปอร์</Label>
          <rect x={34} y={119} width={54} height={14} rx={4} fill="#dcfce7" />
          <Label x={40} y={128.5} size={6.5} weight={600} fill={GREEN}>วิดเจ็ต</Label>
          <Label x={40} y={146} size={6.5}>การตั้งค่า</Label>
          <TapBox x={34} y={119} w={54} h={14} />
          <Tap x={60} y={185} hold />
        </>
      );
    case 'android-explore':
      // KWGT's own start screen, drawn from a screenshot of the app: dark,
      // "Explore" at the top, Create and Import side by side, the widget
      // just placed shown as "Currently editing".
      return (
        <>
          <rect x={9} y={12} width={102} height={196} fill="#303030" />
          <rect x={9} y={12} width={102} height={30} fill="#3a3a3a" />
          <rect x={16} y={27} width={4} height={4} rx={1} fill="#e5e7eb" />
          <rect x={21} y={27} width={4} height={4} rx={1} fill="#e5e7eb" />
          <rect x={16} y={32} width={4} height={4} rx={1} fill="#e5e7eb" />
          <rect x={21} y={32} width={4} height={4} rx={1} fill="#9ca3af" />
          <Label x={30} y={35} fill="#f9fafb" size={9} weight={600}>Explore</Label>
          <circle cx={94} cy={31} r={3.5} fill="none" stroke="#f9fafb" strokeWidth={1} />
          <rect x={15} y={48} width={42} height={16} rx={3} fill="none" stroke="#9ca3af" strokeWidth={0.7} />
          <Label x={36} y={58.5} fill="#f9fafb" size={6.5} anchor="middle">+  Create</Label>
          <rect x={63} y={48} width={42} height={16} rx={3} fill="none" stroke="#9ca3af" strokeWidth={0.7} />
          <Label x={84} y={58.5} fill="#f9fafb" size={6.5} anchor="middle">Import</Label>
          <rect x={15} y={70} width={90} height={26} rx={6} fill="#424242" />
          <Label x={21} y={81} fill="#f9fafb" size={7} weight={600}>Widget 64</Label>
          <circle cx={23.5} cy={89} r={2.6} fill="#3b82f6" />
          <Label x={29} y={91} fill="#60a5fa" size={5.5}>Currently editing</Label>
          <Label x={15} y={110} fill="#f9fafb" size={6.5} weight={600}>Discover new packs</Label>
          <rect x={15} y={115} width={62} height={20} rx={5} fill="#4a2b2b" />
          <rect x={80} y={115} width={30} height={20} rx={5} fill="#3b2a55" />
          <Label x={15} y={150} fill="#f9fafb" size={6.5} weight={600}>Installed packs</Label>
          <rect x={15} y={155} width={62} height={18} rx={5} fill="#424242" />
          <rect x={9} y={188} width={102} height={20} fill="#262626" />
          <circle cx={28} cy={196} r={3} fill="none" stroke="#60a5fa" strokeWidth={1} />
          <Label x={28} y={205} fill="#60a5fa" size={4.5} anchor="middle">Explore</Label>
          <rect x={57} y={193.5} width={6} height={5} rx={1} fill="none" stroke="#9ca3af" strokeWidth={0.8} />
          <Label x={60} y={205} fill="#9ca3af" size={4.5} anchor="middle">Library</Label>
          <Label x={92} y={205} fill="#9ca3af" size={4.5} anchor="middle">Backups</Label>
          <TapBox x={15} y={48} w={42} h={16} />
        </>
      );
    // The KWGT editor, drawn from screenshots of KWGT 3.82 (free) taken on
    // the owner's phone. The free version shows an advert along the bottom;
    // it is drawn as a plain strip so nobody takes it for part of the steps.
    case 'kwgt-editor':
      // Nothing added yet, so the preview is an empty grey box.
      return (
        <>
          <KwgtBody topIcons={['menu', null, null, null, 'save', 'history', 'plus']} rail="Root" preview={null} />
          <KwgtTabs names={['ITEMS', 'BACKGROUND', 'LAYER']} />
          <Label x={13} y={157} fill={K.sub} size={4.6}>This container is empty, you can add</Label>
          <Label x={13} y={163} fill={K.sub} size={4.6}>a new object using the plus (+)</Label>
          <Label x={13} y={169} fill={K.sub} size={4.6}>button on the top right.</Label>
          <Tap x={103} y={26.5} r={7} />
        </>
      );
    case 'kwgt-add-menu': {
      const cards: [string, string][] = [
        ['Komponent', 'Text'],
        ['Shape', 'Image'],
        ['Icon', 'Progress'],
        ['Morphing Text', 'Series'],
        ['Overlap Group', 'Stack Group'],
      ];
      return (
        <>
          <rect x={9} y={12} width={102} height={196} fill={K.bg} />
          <rect x={9} y={12} width={102} height={21} fill={K.bar} />
          <KwgtIcon kind="menu" x={17} y={26.5} />
          {cards.map((row, r) =>
            row.map((name, c) => {
              const x = 13 + c * 48;
              const y = 38 + r * 29;
              return (
                <g key={name}>
                  <rect x={x} y={y} width={46} height={25} fill={K.card} />
                  <rect x={x + 3} y={y + 4} width={5} height={5} rx={1} fill={K.text} />
                  <Label x={x + 10} y={y + 8.5} fill={K.text} size={name.length > 10 ? 5 : 6}>{name}</Label>
                  <Bar x={x + 3} y={y + 13} w={38} h={2} fill={K.faint} />
                  <Bar x={x + 3} y={y + 18} w={28} h={2} fill={K.faint} />
                </g>
              );
            }),
          )}
          <KwgtAd />
          <TapBox x={61} y={67} w={46} h={25} />
        </>
      );
    }
    case 'kwgt-items':
      return (
        <>
          <KwgtBody topIcons={['menu', null, null, null, 'save', 'history', 'plus']} rail="Root" preview={<PictureIcon x={60} y={78} />} />
          <KwgtTabs names={['ITEMS', 'BACKGROUND', 'LAYER']} />
          <rect x={13} y={151} width={2} height={9} fill={K.faint} />
          <rect x={19} y={152} width={7} height={7} rx={1} fill={K.text} />
          <Label x={30} y={155} fill={K.text} size={5.5}>Image</Label>
          <Label x={30} y={161} fill={K.sub} size={4.2}>Image 200x200</Label>
          <rect x={101} y={152} width={6} height={6} fill="none" stroke={K.text} strokeWidth={0.8} />
          <TapBox x={17} y={150} w={60} h={13} />
        </>
      );
    case 'kwgt-bitmap':
      return (
        <>
          <KwgtBody topIcons={['back', null, null, 'copy', 'lock', 'globe', 'calc']} rail="Image" preview={<PictureIcon x={60} y={78} selected />} />
          <KwgtTabs names={['BITMAP', 'POSITION', 'TOUCH']} />
          <KwgtRows bitmap="Pick Image" checked width="100" />
          <TapBox x={101} y={150} w={6} h={6} n={1} />
          <Tap x={103} y={26.5} r={7} n={2} />
        </>
      );
    case 'kwgt-formula':
      return (
        <>
          <rect x={9} y={12} width={102} height={196} fill={K.bg} />
          <rect x={9} y={12} width={102} height={21} fill={K.bar} />
          <KwgtIcon kind="menu" x={17} y={26.5} />
          <KwgtIcon kind="gear" x={79} y={26.5} />
          <KwgtIcon kind="star" x={91} y={26.5} />
          <KwgtIcon kind="check" x={103} y={26.5} />
          <Label x={13} y={42} fill={K.text} size={5} weight={600}>Text Preview</Label>
          <rect x={13} y={45} width={94} height={9} fill={K.card} />
          <Label x={13} y={63} fill={K.text} size={5} weight={600}>Formula Editor</Label>
          <rect x={13} y={66} width={94} height={30} fill={K.card} />
          <Label x={15} y={72} fill={K.sub} size={3.8}>You can use file:///localpath or http://url</Label>
          <rect x={15} y={75} width={90} height={12} rx={1} fill="#fef3c7" />
          <Label x={17} y={80} size={4.2} fill={INK}>https://…/api/widget/image?key=pmw_…</Label>
          <Label x={17} y={85} size={4.2} fill={INK}>&amp;size=wide&amp;t=$df(yyMMddHH)$</Label>
          <circle cx={37} cy={91.5} r={2} fill="none" stroke={K.sub} strokeWidth={0.7} />
          <circle cx={60} cy={91.5} r={2} fill={K.sub} />
          <circle cx={83} cy={91.5} r={2} fill="none" stroke={K.sub} strokeWidth={0.7} />
          <Label x={13} y={105} fill={K.text} size={5} weight={600}>Examples</Label>
          {[0, 1, 2, 3].map((r) =>
            [0, 1].map((c) => <rect key={`${r}-${c}`} x={13 + c * 48} y={109 + r * 19} width={46} height={16} fill={K.card} />),
          )}
          <KwgtAd />
          <TapBox x={15} y={75} w={90} h={12} n={1} />
          <Tap x={103} y={26.5} r={7} n={2} />
        </>
      );
    case 'kwgt-width':
      return (
        <>
          <KwgtBody topIcons={['menu', null, null, null, null, 'save', 'history']} rail="Image" preview={<MiniWidget x={23} y={62} w={74} />} />
          <KwgtTabs names={['BITMAP', 'POSITION', 'TOUCH']} />
          <KwgtRows bitmap="https://…/api/widget/…" width="360" />
          <Tap x={89.5} y={183} r={5} n={1} />
          <Tap x={88.5} y={26.5} r={7} n={2} />
        </>
      );
    // 11-14, from the owner's screenshots of the TOUCH tab, the Add Global
    // dialog and the Flow editor. The Trigger Flow chooser itself was not
    // photographed, so step 14 shows its result -- the second TOUCH row.
    case 'kwgt-touch-link':
      return (
        <>
          <KwgtBody topIcons={['menu', null, null, null, 'save', 'history', 'plus']} rail="Image" preview={<MiniWidget x={23} y={62} w={74} />} />
          <KwgtTabs names={['BITMAP', 'POSITION', 'TOUCH']} active={2} />
          <TouchRow y={150} action="Open Link" />
          <Tap x={102.8} y={26.5} r={7} n={1} />
          <TapBox x={37} y={150} w={32} h={6} n={2} />
        </>
      );
    case 'kwgt-add-global':
      return (
        <>
          <KwgtBody topIcons={['menu', null, null, null, 'save', 'history', 'plus']} rail="Root" preview={<MiniWidget x={23} y={62} w={74} />} />
          <KwgtTabs names={['LAYER', 'GLOBALS', 'FLOWS']} active={1} />
          <rect x={9} y={12} width={102} height={196} fill="#000000" fillOpacity={0.45} />
          <rect x={16} y={72} width={88} height={66} rx={2} fill="#424242" />
          <Label x={22} y={84} fill={K.text} size={7} weight={600}>Add Global</Label>
          <Label x={22} y={97} fill={K.sub} size={4.6}>Title</Label>
          <Label x={40} y={97} fill={K.text} size={5}>refresh</Label>
          <rect x={39} y={99} width={58} height={0.6} fill={K.text} />
          <Label x={22} y={110} fill={K.sub} size={4.6}>Type</Label>
          <Label x={40} y={110} fill={K.text} size={5}>Text</Label>
          <path d="M92 107.5l2.5 2.5 2.5-2.5z" fill={K.text} />
          <Label x={22} y={122} fill={K.sub} size={4.6}>Desc</Label>
          <rect x={39} y={124} width={58} height={0.6} fill={K.sub} />
          <Label x={74} y={134} fill={K.blue} size={4.8} anchor="middle">CANCEL</Label>
          <Label x={94} y={134} fill={K.blue} size={4.8} anchor="middle">OK</Label>
          <TapBox x={39} y={105} w={60} h={7} n={1} />
          <Tap x={94} y={132.5} r={6} n={2} />
        </>
      );
    case 'kwgt-flow':
      return (
        <>
          <rect x={9} y={12} width={102} height={196} fill={F.bg} />
          <path d="M20 30h-5M17 27.5l-2.5 2.5 2.5 2.5" fill="none" stroke={F.text} strokeWidth={0.9} strokeLinecap="round" />
          <Label x={27} y={32} fill={F.text} size={7} weight={600}>Flow</Label>
          <path d="M98 30l2 2.2 4-4.4" fill="none" stroke={F.sub} strokeWidth={1} strokeLinecap="round" />
          <rect x={13} y={40} width={94} height={11} rx={2} fill="none" stroke="#3f4450" strokeWidth={0.7} />
          <Label x={17} y={47.5} fill={F.text} size={4.8}>Flow000</Label>
          <Label x={13} y={60} fill={F.sub} size={4.2}>Triggers</Label>
          <FlowCard y={63} icon="☝" title="Manual" />
          <Label x={13} y={86} fill={F.sub} size={4.2}>Actions</Label>
          <Label x={104} y={86} fill={F.blue} size={4.2} anchor="end">Test flow ▷</Label>
          <FlowCard y={89} icon="{ }" title="Formula" detail="Formula: $df(Hmmss)$" />
          <Label x={60} y={112} fill={F.sub} size={4} anchor="middle">↓</Label>
          <FlowCard y={114} icon="◍" title="Set Global Var" detail="Global: refresh · As text" />
          <Label x={60} y={137} fill={F.sub} size={4} anchor="middle">↓</Label>
          <rect x={13} y={139} width={94} height={12} rx={3} fill={F.card} />
          <Label x={20} y={147} fill={F.blue} size={5}>+  Add action</Label>
          <Order n={1} x={13} y={63} />
          <Order n={2} x={13} y={89} />
          <Order n={3} x={13} y={114} />
          <Tap x={101} y={30} r={6.5} n={4} />
        </>
      );
    case 'kwgt-touch-flow':
      return (
        <>
          <KwgtBody topIcons={['menu', null, null, null, 'save', 'history', 'plus']} rail="Image" preview={<MiniWidget x={23} y={62} w={74} />} />
          <KwgtTabs names={['BITMAP', 'POSITION', 'TOUCH']} active={2} />
          <TouchRow y={150} action="Open Link" />
          <TouchRow y={160} action="Trigger Flow" />
          <TapBox x={37} y={160} w={34} h={6} n={1} />
          <Tap x={74.2} y={26.5} r={7} n={2} />
        </>
      );
  }
}

/** KWGT's own dark palette, taken from the screenshots. */
const K = { bg: '#333333', bar: '#454545', rail: '#2b2b2b', card: '#4a4a4a', preview: '#454545', text: '#e5e7eb', sub: '#a3a3a3', faint: '#6b6b6b', blue: '#60a5fa' };

type KwgtIconKind = 'menu' | 'save' | 'history' | 'plus' | 'back' | 'copy' | 'lock' | 'globe' | 'calc' | 'gear' | 'star' | 'check';

/** The top-bar icons, simplified to a few strokes each. */
function KwgtIcon({ kind, x, y }: { kind: KwgtIconKind; x: number; y: number }) {
  const s = { fill: 'none', stroke: K.text, strokeWidth: 0.9, strokeLinecap: 'round' as const };
  switch (kind) {
    case 'menu':
      return <path d={`M${x - 3.5} ${y - 2.5}h7M${x - 3.5} ${y}h7M${x - 3.5} ${y + 2.5}h7`} {...s} />;
    case 'save':
      return <g><rect x={x - 3} y={y - 3} width={6} height={6} rx={0.8} fill={K.text} /><circle cx={x} cy={y + 0.8} r={1.1} fill={K.bar} /></g>;
    case 'history':
      return <path d={`M${x - 2.8} ${y}a2.8 2.8 0 1 0 0.8 -2M${x} ${y - 1.4}v1.6l1 0.8`} {...s} />;
    case 'plus':
      return <path d={`M${x - 3.5} ${y}h7M${x} ${y - 3.5}v7`} {...s} strokeWidth={1.1} />;
    case 'back':
      return <path d={`M${x + 3.5} ${y}h-7M${x - 1} ${y - 3}l-2.5 3 2.5 3`} {...s} />;
    case 'copy':
      return <g {...s}><rect x={x - 2.5} y={y - 1.5} width={5} height={5} /><path d={`M${x - 1.5} ${y - 3.5}h4v4`} /></g>;
    case 'lock':
      return <g><rect x={x - 2.5} y={y - 0.5} width={5} height={4} rx={0.6} fill={K.text} /><path d={`M${x - 1.5} ${y - 0.5}v-1.3a1.5 1.5 0 0 1 3 0v1.3`} {...s} /></g>;
    case 'globe':
      return <g {...s}><circle cx={x} cy={y} r={3} /><ellipse cx={x} cy={y} rx={1.3} ry={3} /></g>;
    case 'calc':
      return (
        <g>
          <rect x={x - 2.5} y={y - 3.5} width={5} height={7} rx={0.6} fill="none" stroke={K.text} strokeWidth={0.8} />
          <rect x={x - 1.6} y={y - 2.7} width={3.2} height={1.4} fill={K.text} />
          {[0, 1, 2].map((r) => [0, 1].map((c) => <circle key={`${r}${c}`} cx={x - 0.9 + c * 1.8} cy={y + 0.2 + r * 1.2} r={0.4} fill={K.text} />))}
        </g>
      );
    case 'gear':
      return <g><circle cx={x} cy={y} r={2.8} fill="none" stroke={K.text} strokeWidth={1.4} strokeDasharray="1.2 0.8" /><circle cx={x} cy={y} r={1} fill={K.text} /></g>;
    case 'star':
      return <path d={`M${x} ${y - 3.2}l0.95 2.1 2.3 0.2-1.75 1.5 0.55 2.25L${x} ${y + 1.6}l-2.05 1.25 0.55-2.25-1.75-1.5 2.3-0.2z`} fill={K.text} />;
    case 'check':
      return <path d={`M${x - 3} ${y}l2 2.2 4-4.4`} {...s} strokeWidth={1.1} />;
  }
}

/** A picture placeholder, as KWGT draws an Image with no bitmap yet. */
function PictureIcon({ x, y, selected = false }: { x: number; y: number; selected?: boolean }) {
  return (
    <g>
      {selected && <rect x={x - 7.5} y={y - 7.5} width={15} height={15} fill="none" stroke={K.blue} strokeWidth={0.8} />}
      <rect x={x - 6} y={y - 6} width={12} height={12} rx={2} fill="#d4d4d4" stroke="#111111" strokeWidth={0.8} />
      <path d={`M${x - 4} ${y + 3}l2.5-3 1.5 1.5 2-2.5 2 4z`} fill="#333333" />
    </g>
  );
}

/** Editor chrome: top bar, the item rail on the left, tools on the right, the preview between. */
function KwgtBody({ topIcons, rail, preview }: { topIcons: (KwgtIconKind | null)[]; rail: string; preview: ReactNode }) {
  return (
    <>
      <rect x={9} y={12} width={102} height={196} fill={K.bg} />
      <rect x={9} y={12} width={102} height={21} fill={K.bar} />
      {topIcons.map((kind, i) => (kind ? <KwgtIcon key={i} kind={kind} x={17 + i * 14.3} y={26.5} /> : null))}
      <rect x={9} y={33} width={10} height={104} fill={K.rail} />
      <rect x={11} y={36} width={6} height={4} rx={0.6} fill={K.text} />
      <text x={14} y={44} fontSize={4.6} fill={K.text} transform={`rotate(90 14 44)`}>{rail}</text>
      <rect x={101} y={33} width={10} height={104} fill={K.rail} />
      {[38, 46, 54, 62, 70].map((y) => (
        <rect key={y} x={103.5} y={y} width={5} height={5} rx={0.6} fill="none" stroke={K.text} strokeWidth={0.6} />
      ))}
      <rect x={21} y={55} width={78} height={46} fill={K.preview} />
      {preview}
      <KwgtAd />
    </>
  );
}

/** The tab row under the preview, with the open one underlined. */
function KwgtTabs({ names, active = 0 }: { names: string[]; active?: number }) {
  // Placed by the length of the names before it, so a long one ("BACKGROUND")
  // does not run into the next.
  const xs = names.map((_, i) => 13 + names.slice(0, i).reduce((sum, before) => sum + before.length * 2.9 + 5, 0));
  return (
    <>
      {names.map((name, i) => (
        <Label key={name} x={xs[i]} y={144} fill={i === active ? K.text : K.sub} size={4.2}>{name}</Label>
      ))}
      <rect x={xs[active] - 2} y={146} width={names[active].length * 2.9 + 4} height={0.8} fill={K.blue} />
    </>
  );
}

/** One row of the TOUCH tab: "Single" and the action it runs. */
function TouchRow({ y, action }: { y: number; action: string }) {
  return (
    <g>
      <rect x={13} y={y} width={4} height={6} rx={2} fill={K.text} />
      <Label x={20} y={y + 4.8} fill={K.text} size={4.6}>Single</Label>
      <Label x={38} y={y + 4.8} fill={K.text} size={4.6}>{action}</Label>
      <rect x={101} y={y} width={6} height={6} fill="none" stroke={K.text} strokeWidth={0.6} />
    </g>
  );
}

/** KWGT's Flow editor, which has its own darker, bluer look. */
const F = { bg: '#181a20', card: '#2a2e37', text: '#e5e7eb', sub: '#9ca3af', blue: '#60a5fa' };

function FlowCard({ y, icon, title, detail }: { y: number; icon: string; title: string; detail?: string }) {
  return (
    <g>
      <rect x={13} y={y} width={94} height={detail ? 17 : 12} rx={3} fill={F.card} />
      <Label x={20} y={y + (detail ? 8 : 8)} fill={F.text} size={4.6} anchor="middle">{icon}</Label>
      <Label x={27} y={y + 7.5} fill={F.text} size={5}>{title}</Label>
      {detail && <Label x={27} y={y + 13.5} fill={F.sub} size={4}>{detail}</Label>}
    </g>
  );
}

/** The Image item's BITMAP tab: Bitmap, Mode, Sizing, Width. */
function KwgtRows({ bitmap, checked = false, width }: { bitmap: string; checked?: boolean; width: string }) {
  const rows: [string, string][] = [
    ['Bitmap', bitmap],
    ['Mode', 'Bitmap'],
    ['Sizing', 'Fit width'],
  ];
  return (
    <>
      {rows.map(([name, value], i) => {
        const y = 150 + i * 10;
        return (
          <g key={name}>
            <Label x={13} y={y + 4.5} fill={K.text} size={4.6}>{name}</Label>
            <Label x={33} y={y + 4.5} fill={K.text} size={4.6}>{value}</Label>
            {i === 0 && checked ? (
              <g>
                <rect x={101} y={y} width={6} height={6} fill="#3b82f6" />
                <path d={`M${102.4} ${y + 3}l1.2 1.3 2.2-2.6`} fill="none" stroke="#ffffff" strokeWidth={0.8} />
              </g>
            ) : (
              <rect x={101} y={y} width={6} height={6} fill="none" stroke={K.text} strokeWidth={0.6} />
            )}
          </g>
        );
      })}
      <Label x={13} y={184.5} fill={K.text} size={4.6}>Width</Label>
      {/* ⏪ − value + ⏩, drawn: the arrow characters come out as emoji. */}
      <path d="M38 180.5l-2.5 2.5 2.5 2.5zM35.5 180.5l-2.5 2.5 2.5 2.5z" fill={K.text} />
      <path d="M42 183h3" stroke={K.text} strokeWidth={0.8} />
      <Label x={48} y={184.5} fill={K.text} size={4.6}>{width}</Label>
      <path d="M79 183h3.4M80.7 181.3v3.4" stroke={K.text} strokeWidth={0.8} />
      <path d="M87 180.5l2.5 2.5-2.5 2.5zM89.5 180.5l2.5 2.5-2.5 2.5z" fill={K.text} />
      <rect x={101} y={180} width={6} height={6} fill="none" stroke={K.text} strokeWidth={0.6} />
    </>
  );
}

/** The free version's advert strip along the bottom. */
function KwgtAd() {
  return (
    <>
      <rect x={9} y={189} width={102} height={19} fill="#1f1f1f" />
      <Label x={60} y={200.5} fill="#6b6b6b" size={4.5} anchor="middle">โฆษณา (KWGT ฟรี)</Label>
    </>
  );
}

export function PhoneArt({ art, os }: { art: StepArt; os: 'ios' | 'android' }) {
  // Several of these share a page, so each clip needs an id of its own.
  const clipId = `screen-${useId().replace(/:/g, '')}`;
  const screen = { x: 9, y: 12, width: 102, height: 196, rx: os === 'ios' ? 14 : 9 };
  return (
    <svg viewBox="0 0 120 220" className="w-full max-w-[150px] h-auto mx-auto" role="img" aria-hidden="true" fontFamily="inherit">
      <defs>
        <clipPath id={clipId}>
          <rect {...screen} />
        </clipPath>
      </defs>
      <rect x={4} y={4} width={112} height={212} rx={os === 'ios' ? 20 : 14} fill={FRAME} />
      <rect {...screen} fill={SCREEN} />
      {/* Clipped to the screen, so an app's square title bar keeps the
          screen's rounded corners. */}
      <g clipPath={`url(#${clipId})`}>
        <Screen art={art} />
      </g>
      {os === 'ios' ? (
        <rect x={45} y={15} width={30} height={7} rx={3.5} fill={FRAME} />
      ) : (
        <circle cx={60} cy={17} r={2.5} fill={FRAME} />
      )}
    </svg>
  );
}
