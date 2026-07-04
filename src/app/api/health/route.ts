import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Temporary deployment health probe.
 *
 * Used to diagnose whether Vercel production is serving the current App Router
 * API routes at all. Test: GET /api/health.
 *   - 200 { ok: true, build: "api-health" } → App Router API routes are live;
 *     if the cron route still 404s the issue is specific to that path.
 *   - 404 → production is deploying an old commit or a wrong Root Directory
 *     (the whole /api tree is missing).
 *
 * Safe to remove once deployment is confirmed. No auth, no data, no secrets.
 */
export function GET() {
  return NextResponse.json({ ok: true, build: "api-health" });
}
