/**
 * Small pieces the tracker's table, drawer and dialogs all draw the same way.
 * No state and no hooks, so they render wherever they are imported.
 */

// Shared with the meeting planner, which draws its people the same way.
export { Avatar } from '@/lib/ui/avatar';

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
