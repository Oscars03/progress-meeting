import { redirect } from 'next/navigation';

/**
 * Settings was one long page; it is now five, and this address opens the
 * first. Kept so bookmarks, old links and the sidebar icon (collapsed, with no
 * room for the sub-menu) still land somewhere.
 */
export default function SettingsPage() {
  redirect('/settings/account');
}
