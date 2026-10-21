/**
 * The browser's half of the app log: errors the server never sees, and which
 * pages people open. Sent to /api/log, which writes them to the sheet.
 *
 * Fire and forget. Reporting must never be the thing that breaks a page, so
 * every path here swallows its own failures, and nothing waits for an answer.
 */

const ENDPOINT = '/api/log';

/** A page that throws in a loop says so a few times, not a few thousand. */
const MAX_ERRORS_PER_PAGE_LOAD = 10;

/** The same page twice this close together is one visit -- a re-render, a double mount in dev. */
const VIEW_DEDUPE_MS = 2_000;

type ErrorSource = 'boundary' | 'global-boundary' | 'window' | 'promise';

const reported = new Set<string>();
let errorsSent = 0;
let lastView: { path: string; at: number } | null = null;

function send(body: Record<string, unknown>): void {
  try {
    const json = JSON.stringify(body);
    // text/plain is a type sendBeacon may always send; the server parses the
    // body itself. A JSON type is refused by some browsers for a beacon.
    const blob = new Blob([json], { type: 'text/plain;charset=UTF-8' });
    if (navigator.sendBeacon?.(ENDPOINT, blob)) return;
    void fetch(ENDPOINT, { method: 'POST', body: json, keepalive: true, credentials: 'same-origin' }).catch(
      () => {}
    );
  } catch {
    // Nothing to be done, and nothing worth breaking over.
  }
}

/**
 * Errors that say nothing about this app.
 *
 * "Script error." is a script from another origin with its details hidden; the
 * ResizeObserver one is a browser warning reported as an error; anything whose
 * stack runs through an extension is the extension's.
 */
export function isNoise(message: string, stack: string): boolean {
  if (message === 'Script error.' || message === 'Script error') return true;
  if (message.startsWith('ResizeObserver loop')) return true;
  return /(chrome|moz|safari(-web)?)-extension:\/\//.test(stack);
}

function messageAndStack(error: unknown): { message: string; stack: string } {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, stack: error.stack ?? '' };
  if (typeof error === 'string') return { message: error, stack: '' };
  try {
    return { message: JSON.stringify(error) ?? String(error), stack: '' };
  } catch {
    return { message: String(error), stack: '' };
  }
}

export function reportClientError(
  error: unknown,
  extra: { source: ErrorSource; digest?: string }
): void {
  if (typeof window === 'undefined') return;
  try {
    const { message, stack } = messageAndStack(error);
    if (!message || isNoise(message, stack)) return;

    const key = `${message}\n${stack.slice(0, 300)}`;
    if (reported.has(key) || errorsSent >= MAX_ERRORS_PER_PAGE_LOAD) return;
    reported.add(key);
    errorsSent += 1;

    send({
      kind: 'error',
      message,
      stack,
      digest: extra.digest ?? '',
      source: extra.source,
      path: window.location.pathname,
    });
  } catch {
    // See send().
  }
}

export function reportView(path: string): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (lastView && lastView.path === path && now - lastView.at < VIEW_DEDUPE_MS) return;
  lastView = { path, at: now };
  send({ kind: 'view', path });
}
