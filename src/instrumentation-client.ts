import { reportClientError } from './lib/client-log';

/**
 * Errors thrown in the browser outside React's rendering -- a click handler,
 * a timer, a promise nobody awaited -- reach the app log from here. Errors
 * during rendering are caught by error.tsx instead, which reports them itself.
 *
 * Runs on every page, the login form included, before the app is interactive.
 */
try {
  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? event.message, { source: 'window' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, { source: 'promise' });
  });
} catch {
  // A browser without these is a browser the log cannot help with.
}
