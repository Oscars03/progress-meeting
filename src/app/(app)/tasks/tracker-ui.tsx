/**
 * Small pieces the tracker's table, drawer and dialogs all draw the same way.
 * No state and no hooks, so they render wherever they are imported.
 */

import type { TrackerPerson } from './tracker-model';

/** The first letter that stands for the name: past "อ." and a leading vowel. */
function initialOf(name: string): string {
  return name.replace(/^อ\.\s*/, '').replace(/^[เแโใไ]/, '').charAt(0).toUpperCase() || '?';
}

export function Avatar({ person, large = false }: { person: TrackerPerson; large?: boolean }) {
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

export function Tag({ tag }: { tag: string }) {
  if (!tag) return null;
  return (
    <span className="trk-tag" data-tag={tag}>
      {tag}
    </span>
  );
}

export function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
