/**
 * A person as a coloured initial, the way Tasks has always drawn them. No
 * state and no hooks, so it renders wherever it is imported. The colour comes
 * from lib/person-tone.ts; the variables live in globals.css with both themes.
 */

/** The first letter that stands for the name: past "อ." and a leading vowel. */
function initialOf(name: string): string {
  return name.replace(/^อ\.\s*/, '').replace(/^[เแโใไ]/, '').charAt(0).toUpperCase() || '?';
}

export function Avatar({ person, large = false }: { person: { name: string; tone: number }; large?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`trk-av${large ? ' trk-av-lg' : ''}`}
      style={{ '--ab': `var(--trk-av${person.tone}-bg)`, '--ai': `var(--trk-av${person.tone}-ink)` } as React.CSSProperties}
    >
      {initialOf(person.name)}
    </span>
  );
}
