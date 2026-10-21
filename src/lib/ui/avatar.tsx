/**
 * A person as a coloured initial, the way Tasks has always drawn them. No
 * state and no hooks, so it renders wherever it is imported.
 *
 * The colour is the one they chose in Settings, or else the automatic one
 * from lib/person-tone.ts; the letter is their nickname's, or else their
 * name's. A ring in the colour of their role says who is an advisor at a
 * glance. The colours live in globals.css, with both themes.
 */

/** The first letter that stands for a name: past "อ." and a leading vowel. */
function initialOf(name: string): string {
  return name.replace(/^อ\.\s*/, '').replace(/^[เแโใไ]/, '').charAt(0).toUpperCase() || '?';
}

export function Avatar({
  person,
  large = false,
}: {
  person: { name: string; tone: number; color?: string; nickname?: string; role?: string };
  large?: boolean;
}) {
  const fill = person.color ? `av-${person.color}` : `trk-av${person.tone}`;
  return (
    <span
      aria-hidden="true"
      className={`trk-av${large ? ' trk-av-lg' : ''}`}
      data-role={person.role || undefined}
      style={{ '--ab': `var(--${fill}-bg)`, '--ai': `var(--${fill}-ink)` } as React.CSSProperties}
    >
      {initialOf(person.nickname || person.name)}
    </span>
  );
}
