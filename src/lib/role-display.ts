/**
 * How roles are ordered and coloured wherever people are listed.
 *
 * By rank -- admin, then professor, then student -- and one colour per role,
 * used for its badge, a tint on its row and a stripe down the row's left edge,
 * so who is what reads down the page at a glance. An unrecognised role sorts
 * last and looks like a student, the same floor requireSession gives it.
 *
 * A plain module, not part of an actions file: a 'use server' file may only
 * export async functions (see CLAUDE.md).
 */
const ROLE_ORDER: Record<string, number> = { admin: 0, professor: 1, student: 2 };

const ROLE_STYLE: Record<string, { row: string; stripe: string; badge: string }> = {
  admin: { row: 'bg-purple-50', stripe: 'border-purple-400', badge: 'bg-purple-100 text-purple-700' },
  professor: { row: 'bg-amber-50', stripe: 'border-amber-400', badge: 'bg-amber-100 text-amber-700' },
  student: { row: 'bg-blue-50', stripe: 'border-blue-400', badge: 'bg-blue-100 text-blue-700' },
};

export function roleStyle(role: string): { row: string; stripe: string; badge: string } {
  return ROLE_STYLE[role] ?? ROLE_STYLE.student;
}

/** Sort comparator: rank first, then name in Thai collation order. */
export function byRoleThenName(a: { role: string; name: string }, b: { role: string; name: string }): number {
  const rank = (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3);
  return rank !== 0 ? rank : a.name.localeCompare(b.name, 'th');
}
