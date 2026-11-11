/**
 * Links typed in by people, checked before they are stored or drawn.
 *
 * A plain module so a server action and a page can both use it. A link is
 * checked again where it is shown, because a cell in the sheet can be edited
 * by hand and nothing on the way in protects what is read back out.
 */

export const MAX_URL_LENGTH = 2048;

/**
 * The link as a clean https URL, or null.
 *
 * https only -- which also refuses `javascript:`, `data:` and `vbscript:` --
 * no user name or password inside it, and not absurdly long.
 */
export function safeHttpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text || text.length > MAX_URL_LENGTH) return null;

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (!url.hostname) return null;
  return url.toString();
}

/**
 * Whether the link points at Facebook: facebook.com, any subdomain of it, or
 * fb.watch. Matched on the parsed host name, so `facebook.com.evil.example`
 * and `evil-facebook.com` do not pass.
 *
 * This cannot tell whether the post is on the lab's own Page -- only that it
 * is a Facebook link at all.
 */
export function isLabFacebookUrl(value: unknown): boolean {
  const safe = safeHttpsUrl(value);
  if (!safe) return false;
  const host = new URL(safe).hostname.toLowerCase();
  return host === 'facebook.com' || host.endsWith('.facebook.com') || host === 'fb.watch';
}
