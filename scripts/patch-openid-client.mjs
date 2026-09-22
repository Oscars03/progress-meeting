/**
 * Replace the two `url.parse()` calls that Google sign-in reaches in
 * openid-client with the WHATWG `URL` API.
 *
 * Node reports `url.parse()` as DEP0169, and production logs flagged every
 * Google sign-in as an error because of it. It comes from openid-client 5.x,
 * which next-auth v4 depends on; 5.7.1 is the last 5.x and next-auth v4 cannot
 * use 6.x, so no upgrade removes it.
 *
 * Only the two paths next-auth calls are touched:
 *
 * - `resolveWellKnownUri` (issuer.js) runs on `Issuer.discover`, when the
 *   sign-in button is pressed.
 * - `getSearchParams` (client.js) runs on the callback from Google. Its input
 *   can be a relative request path, so it gets a base URL; only the query
 *   string is read, so the base never shows up in the result.
 *
 * `endSessionUrl` and `webfinger` still use `url.parse()`; next-auth never
 * calls them.
 *
 * Runs from `postinstall`, so it applies wherever `npm install` / `npm ci`
 * does -- locally, in CI and on Vercel. Idempotent. If openid-client's code
 * changes and neither the original nor the patched text is found, it fails the
 * install rather than leaving the warning back in silently.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

// Resolve the entry point (lib/index.js): the package's `exports` field does not
// expose package.json, so resolving that throws even when it is installed.
let lib
try {
  lib = dirname(require.resolve('openid-client'))
} catch (error) {
  if (error.code !== 'MODULE_NOT_FOUND') throw error
  console.log('patch-openid-client: openid-client is not installed, nothing to patch')
  process.exit(0)
}

const edits = [
  {
    file: 'client.js',
    from: `  const parsed = url.parse(input);
  if (!parsed.search) return {};`,
    to: `  const parsed = new URL(input, 'http://localhost');
  if (!parsed.search) return {};`,
  },
  {
    file: 'issuer.js',
    from: `  const parsed = url.parse(uri);
  if (parsed.pathname.includes('/.well-known/')) {
    return uri;
  } else {
    let pathname;
    if (parsed.pathname.endsWith('/')) {
      pathname = \`\${parsed.pathname}.well-known/openid-configuration\`;
    } else {
      pathname = \`\${parsed.pathname}/.well-known/openid-configuration\`;
    }
    return url.format({ ...parsed, pathname });
  }`,
    to: `  const parsed = new URL(uri);
  if (parsed.pathname.includes('/.well-known/')) {
    return uri;
  } else {
    if (parsed.pathname.endsWith('/')) {
      parsed.pathname = \`\${parsed.pathname}.well-known/openid-configuration\`;
    } else {
      parsed.pathname = \`\${parsed.pathname}/.well-known/openid-configuration\`;
    }
    return parsed.href;
  }`,
  },
]

for (const { file, from, to } of edits) {
  const path = join(lib, file)
  // Normalise line endings so a CRLF checkout matches too.
  const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
  if (source.includes(to)) continue
  if (!source.includes(from)) {
    console.error(
      `patch-openid-client: the expected code is not in openid-client/lib/${file}.\n` +
        'openid-client has changed -- check whether it still calls url.parse() and update ' +
        'scripts/patch-openid-client.mjs, or remove it if the call is gone.',
    )
    process.exit(1)
  }
  writeFileSync(path, source.replace(from, to))
  console.log(`patch-openid-client: patched lib/${file}`)
}
