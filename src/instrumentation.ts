import type { Instrumentation } from 'next';

/**
 * Every error Next catches on the server -- a page, a route handler, an action
 * -- is kept in the app log as well as printed. See lib/app-log.ts.
 */
export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  // The log is written with googleapis, which runs on Node only. Imported here
  // rather than at the top so another runtime never has to load it.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { recordRequestError } = await import('./lib/request-error-log');
  await recordRequestError(...args);
};
