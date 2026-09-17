/**
 * What the app will accept as an uploaded picture.
 *
 * A plain module with no I/O, because the form needs these rules to say no
 * before spending a minute uploading, and the action needs the same rules to
 * say no to a caller that never opened the form. A server action is reachable
 * by anyone holding its id, so the check in the browser decides nothing.
 */

/**
 * The only types accepted. Anything else is refused by name, not by guess.
 *
 * SVG is left out deliberately rather than by oversight: it is a document that
 * can carry script, and these are served back to a signed-in member.
 */
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;

export type ImageType = (typeof IMAGE_TYPES)[number];

/**
 * 5MB, measured after the browser has shrunk the picture.
 *
 * A phone screenshot is a few hundred KB once resized; this is the ceiling for
 * something that arrives unshrunk -- a caller not using the form, or a browser
 * where the canvas step failed -- rather than the size anything should be.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** The longest edge the form shrinks a picture to before sending it. */
export const MAX_IMAGE_EDGE = 1600;

export function isImageType(mime: string): mime is ImageType {
  return (IMAGE_TYPES as readonly string[]).includes(mime);
}

export type UploadProblem = 'uploads.error.type' | 'uploads.error.tooBig' | 'uploads.error.empty';

/**
 * Whether a file may be stored, and if not, which message says why.
 *
 * Returns the problem rather than throwing so both callers can use it: the
 * form to say so at once, the action to refuse.
 */
export function checkImage(file: { type: string; size: number }): UploadProblem | null {
  if (file.size <= 0) return 'uploads.error.empty';
  if (!isImageType(file.type)) return 'uploads.error.type';
  if (file.size > MAX_IMAGE_BYTES) return 'uploads.error.tooBig';
  return null;
}

/** Characters a file name may not carry on Windows, control codes aside. */
const PUNCTUATION_TO_DROP = '<>:"|?*';

/**
 * Whether a character may appear in a stored file name.
 *
 * Written as a code point test rather than a regex character class on purpose.
 * The class would have to spell out the control range as unicode escapes, and
 * a tool that resolves those escapes while writing the file puts real control
 * bytes into the source and turns it binary. That happened here once. Thai and
 * every other letter pass through untouched.
 */
function allowedInName(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code < 0x20 || code === 0x7f) return false;
  return !PUNCTUATION_TO_DROP.includes(ch);
}

/**
 * A file name that is safe to store and to show.
 *
 * Drive does not mind what a file is called, but this name is rendered back
 * into a page and offered as a download, so a name carrying a path or control
 * characters is trimmed down to its last, plain part.
 */
export function safeFileName(name: string, fallback = 'image'): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const cleaned = [...base].filter(allowedInName).join('').trim().slice(0, 120);
  return cleaned || fallback;
}
