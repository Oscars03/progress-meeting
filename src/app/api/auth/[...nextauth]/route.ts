import NextAuth from "next-auth";
import type { NextRequest } from "next/server";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

type Context = { params: Promise<{ nextauth: string[] }> };

/**
 * `_log` is where NextAuth lets the browser send lines to the server's logger.
 * It does nothing until `logger` is set -- which lib/auth.ts now does, to keep
 * NextAuth's own errors in the app log -- and then it hands any body, from
 * anyone, signed in or not, to that logger. Answered here so it stays what it
 * always was: nothing. The browser's errors reach the log through /api/log,
 * which is built to be called by strangers.
 */
async function POST(req: NextRequest, ctx: Context) {
  const { nextauth } = await ctx.params;
  if (nextauth?.[0] === "_log") return new Response(null, { status: 204 });
  return handler(req, ctx);
}

export { handler as GET, POST };
