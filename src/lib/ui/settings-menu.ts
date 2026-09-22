/**
 * Whether the Settings sub-menu in the sidebar is open.
 *
 * Open on every Settings page and closed everywhere else -- unless its arrow
 * was pressed on the page you are on, in which case that press wins, for that
 * page only. The first version remembered the press forever, so one tap on the
 * arrow anywhere left the menu shut on every Settings page afterwards.
 *
 * A plain module so the rule can be tested without rendering the sidebar.
 */
export type MenuToggle = { path: string; open: boolean } | null;

export function isSettingsPath(pathname: string): boolean {
  return pathname === '/settings' || pathname.startsWith('/settings/');
}

export function settingsMenuOpen(pathname: string, toggle: MenuToggle): boolean {
  if (toggle && toggle.path === pathname) return toggle.open;
  return isSettingsPath(pathname);
}
