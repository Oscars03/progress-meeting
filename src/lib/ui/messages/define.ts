/**
 * One surface's strings, Thai and English side by side.
 *
 * English is typed against the Thai keys, so a key added in one language and
 * forgotten in the other fails to compile instead of rendering the fallback.
 */
export function defineMessages<K extends string>(messages: {
  th: Record<K, string>;
  en: Record<NoInfer<K>, string>;
}) {
  return messages;
}
