import type { NextConfig } from 'next';

/**
 * Security headers. `frame-ancestors 'none'` and X-Frame-Options both block
 * framing; the CSP allows the inline/eval that Next's dev overlay needs only
 * outside production.
 */
const isDev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://sheets.googleapis.com https://oauth2.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // accounts.google.com as well as 'self': WebKit and Chromium check
  // form-action against the *redirect* a submission follows, not just its
  // action. NextAuth's fallback sign-in page posts to /api/auth/signin/google,
  // which answers with a redirect to Google -- and with 'self' alone the
  // browser blocks it, silently, leaving the person back on the form.
  "form-action 'self' https://accounts.google.com",
].join('; ');

const nextConfig: NextConfig = {
  // The Android widget image reads these at runtime (lib/widget-png.ts), by a
  // path the tracer cannot follow -- so they are named, or the deployed
  // function would start without its renderer or its Thai font.
  // Loaded from node_modules at run time rather than bundled: its glue code
  // imports the .wasm as a module, which the bundler cannot compile.
  serverExternalPackages: ['@resvg/resvg-wasm'],
  outputFileTracingIncludes: {
    '/api/widget/image': [
      './node_modules/@resvg/resvg-wasm/index_bg.wasm',
      './node_modules/@ibm/plex-sans-thai/fonts/complete/woff/IBMPlexSansThai-{Regular,SemiBold}.woff',
    ],
  },
  async headers() {
    return [
      {
        // The sign-in endpoints must never be served from a cache. Two of them
        // hand out values the next request is checked against -- /api/auth/csrf
        // a token that has to match a cookie, /api/auth/session the current
        // one -- so a copy kept by Safari's heuristic caching, or by a CDN in
        // front of this app, makes NextAuth reject a perfectly good sign-in and
        // bounce the browser back to the login page with nothing said. That is
        // the "press it two or three times and eventually it works" shape:
        // every press has to wait for the stale copy to age out.
        source: '/api/auth/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' },
          { key: 'Pragma', value: 'no-cache' },
          { key: 'Expires', value: '0' },
        ],
      },
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: csp },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
