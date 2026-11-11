import { SheetRepo } from '@/lib/db/sheet-repo';
import type {
  ClipRecord,
  ClipSeriesRecord,
  TermBreakRecord,
  UserRecord,
  WeekLeadRecord,
} from '@/lib/db/schema';
import { facesOf, type AvatarFace } from '@/lib/avatar-face';
import { labMembers } from '@/lib/members';

export type ClipData = {
  users: UserRecord[];
  leads: WeekLeadRecord[];
  breaks: TermBreakRecord[];
  series: ClipSeriesRecord[];
  clips: ClipRecord[];
  faces: Map<string, AvatarFace>;
  /** Active members, for the planner and poster pickers. */
  members: { id: string; name: string }[];
};

/**
 * Whether a read failed because the tab is not there yet -- the code was
 * deployed before `npm run db:migrate-schema` created it -- rather than for a
 * reason worth surfacing as an error (quota, network).
 */
function isMissingTab(error: unknown): boolean {
  const e = error as { status?: unknown; code?: unknown; message?: unknown };
  if (e?.status === 400 || e?.code === 400) return true;
  return typeof e?.message === 'string' && e.message.includes('Sheet is behind SCHEMAS');
}

/**
 * Everything the clip pages read, in one batch (one request on a cold cache).
 *
 * Read-only: nothing on these pages writes on load. Null when the clip tabs do
 * not exist yet, so the pages can say the feature is not set up instead of
 * crashing -- the rest of the app never reads these tabs.
 */
export async function loadClips(): Promise<ClipData | null> {
  const missing = Symbol('missing');
  const guard = <T,>(p: Promise<T>) =>
    p.catch((error: unknown) => {
      if (isMissingTab(error)) return missing;
      throw error;
    });

  const [users, leads, breaks, series, clips] = await Promise.all([
    SheetRepo.find<UserRecord>('users'),
    SheetRepo.find<WeekLeadRecord>('week_leads'),
    SheetRepo.find<TermBreakRecord>('term_breaks'),
    guard(SheetRepo.find<ClipSeriesRecord>('clip_series')),
    guard(SheetRepo.find<ClipRecord>('clips')),
  ]);
  if (series === missing || clips === missing) return null;

  return {
    users,
    leads,
    breaks,
    series: series as ClipSeriesRecord[],
    clips: clips as ClipRecord[],
    faces: facesOf(users),
    members: labMembers(users)
      .map((u) => ({ id: u.id, name: u.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'th')),
  };
}
