/**
 * What the browser may tell /api/log, and how often. See app/api/log/route.ts.
 *
 * Its own module because a route file may export nothing but its handlers.
 */

export const MAX_CLIENT_REPORT_BODY = 16_000;
const MAX_MESSAGE = 1_000;
const MAX_STACK = 8_000;
const MAX_REPORTS_PER_MINUTE = 30;
/** Everybody not signed in, together, per instance per day. */
const MAX_ANONYMOUS_PER_DAY = 200;

const SOURCES = ['boundary', 'global-boundary', 'window', 'promise'] as const;

export type ClientReport =
  | { kind: 'view'; path: string }
  | {
      kind: 'error';
      path: string;
      message: string;
      stack: string;
      digest: string;
      source: (typeof SOURCES)[number] | '';
    };

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

/** A path on this site, or ''. Never a URL somewhere else. */
function sitePath(value: unknown): string {
  const raw = text(value, 300);
  return raw.startsWith('/') && !raw.startsWith('//') ? raw.split(/[?#]/)[0] : '';
}

/** The body as one of the two shapes, or null for anything else. */
export function parseClientReport(body: unknown): ClientReport | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  if (b.kind === 'view') {
    const path = sitePath(b.path);
    return path ? { kind: 'view', path } : null;
  }

  if (b.kind === 'error') {
    const message = text(b.message, MAX_MESSAGE);
    if (!message) return null;
    const source = SOURCES.find((s) => s === b.source) ?? '';
    return {
      kind: 'error',
      path: sitePath(b.path),
      message,
      stack: text(b.stack, MAX_STACK),
      digest: text(b.digest, 100),
      source,
    };
  }

  return null;
}

/**
 * Sent from a page of this site, and not from one somewhere else.
 *
 * Browsers send Origin on a POST, sendBeacon included; Sec-Fetch-Site covers
 * the ones that leave it off for a same-origin request.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      return new URL(origin).host === request.headers.get('host');
    } catch {
      return false;
    }
  }
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

// Per instance, so a ceiling rather than an exact count -- enough to stop a
// page that throws on every frame from writing a row for each.
const recent = new Map<string, { windowStart: number; count: number }>();

export function allowedReport(key: string, now: number): boolean {
  if (recent.size > 1_000) {
    for (const [k, slot] of recent) {
      if (now - slot.windowStart >= 60_000) recent.delete(k);
    }
  }
  const slot = recent.get(key);
  if (!slot || now - slot.windowStart >= 60_000) {
    recent.set(key, { windowStart: now, count: 1 });
    return true;
  }
  slot.count += 1;
  return slot.count <= MAX_REPORTS_PER_MINUTE;
}

let anonymousDay = { start: 0, count: 0 };

/**
 * One more report from somebody not signed in, if today still has room.
 *
 * The per-person limit keys on the address the request came from, and a
 * stranger has as many of those as they like. This one does not.
 */
export function allowedAnonymousReport(now: number): boolean {
  if (now - anonymousDay.start >= 24 * 60 * 60_000) anonymousDay = { start: now, count: 0 };
  anonymousDay.count += 1;
  return anonymousDay.count <= MAX_ANONYMOUS_PER_DAY;
}

/** Test seam. */
export function resetClientReportLimits(): void {
  recent.clear();
  anonymousDay = { start: 0, count: 0 };
}
