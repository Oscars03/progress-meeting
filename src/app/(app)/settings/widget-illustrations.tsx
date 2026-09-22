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
  | 'android-add-image'
  | 'android-bitmap';

/**
 * Where to press: a ring around it, hollow so the thing being pressed stays
 * readable -- a filled dot covered exactly the label it pointed at.
 * `hold` adds a dashed outer ring for a long-press.
 */
function Tap({ x, y, hold = false, r = 11 }: { x: number; y: number; hold?: boolean; r?: number }) {
  return (
    <g>
      {hold && <circle cx={x} cy={y} r={r + 5} fill="none" stroke={BLUE} strokeWidth={1.2} strokeDasharray="3 2" />}
      <circle cx={x} cy={y} r={r} fill={BLUE} fillOpacity={0.1} stroke={BLUE} strokeWidth={1.8} />
    </g>
  );
}

/** The same, for something wide -- a button or a field -- outlined rather than ringed. */
function TapBox({ x, y, w, h, hold = false }: { x: number; y: number; w: number; h: number; hold?: boolean }) {
  const m = 3;
  return (
    <g>
      {hold && <rect x={x - m - 4} y={y - m - 4} width={w + (m + 4) * 2} height={h + (m + 4) * 2} rx={(h + 14) / 2} fill="none" stroke={BLUE} strokeWidth={1.2} strokeDasharray="3 2" />}
      <rect x={x - m} y={y - m} width={w + m * 2} height={h + m * 2} rx={(h + m * 2) / 2} fill="none" stroke={BLUE} strokeWidth={1.8} />
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
    case 'android-add-image':
      return (
        <>
          <rect x={9} y={12} width={102} height={22} rx={0} fill="#7c3aed" />
          <Label x={18} y={26} fill="#ffffff" size={7} weight={600}>KWGT</Label>
          <Label x={98} y={27} fill="#ffffff" size={13} anchor="middle">+</Label>
          <rect x={46} y={40} width={60} height={72} rx={6} fill="#ffffff" stroke={LINE} strokeWidth={0.6} />
          {['Text', 'Image', 'Shape', 'Progress'].map((name, i) => (
            <g key={name}>
              {name === 'Image' && <rect x={48} y={42 + i * 17} width={56} height={15} rx={3} fill="#ede9fe" />}
              <Label x={54} y={52 + i * 17} size={6.5} weight={name === 'Image' ? 600 : 400} fill={name === 'Image' ? '#7c3aed' : INK}>{name}</Label>
            </g>
          ))}
          <Tap x={98} y={23} r={9} />
          <TapBox x={48} y={59} w={56} h={15} />
        </>
      );
    case 'android-bitmap':
      return (
        <>
          <rect x={9} y={12} width={102} height={22} rx={0} fill="#7c3aed" />
          <Label x={18} y={26} fill="#ffffff" size={7} weight={600}>Image</Label>
          <rect x={90} y={17} width={12} height={12} rx={2} fill="none" stroke="#ffffff" strokeWidth={1.2} />
          <MiniWidget x={22} y={42} w={76} />
          <Label x={18} y={96} size={6.5} fill="#64748b">Bitmap</Label>
          <rect x={16} y={100} width={88} height={30} rx={4} fill="#fef3c7" stroke="#f59e0b" strokeWidth={0.8} />
          <Label x={20} y={110} size={5.8} fill={INK}>https://…/api/widget/</Label>
          <Label x={20} y={119} size={5.8} fill={INK}>image?key=pmw_…</Label>
          <Label x={20} y={127} size={5.8} fill={INK}>&amp;t=$df(yyMMddHH)$</Label>
          <Tap x={96} y={23} r={10} />
        </>
      );
  }
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
