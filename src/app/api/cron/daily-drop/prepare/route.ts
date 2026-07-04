import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { prepareDailyDrop } from "@/lib/daily-drop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled Daily Outfit Drop preparation — Phase 3A.
 *
 * Prepares (and caches) one drop per opted-in user whose LOCAL time has just
 * passed their preferred drop time. It sends NOTHING to users — no push, no
 * email, no web push. The Today dashboard shows the prepared drop when the user
 * opens the app.
 *
 * Security:
 *   - Protected by CRON_SECRET via `Authorization: Bearer <CRON_SECRET>`.
 *   - No user session required; uses the server-only service-role client.
 *   - Never returns private wardrobe metadata (counts + minimal error info only).
 *
 * Vercel Cron issues GET requests, so GET is the primary handler; POST is also
 * supported for manual invocation. Both enforce the secret.
 */

// If cron runs every 30 min, prepare when local time is in [preferred, preferred+30).
const WINDOW_MINUTES = 30;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // not configured → treat as unauthorized/misconfig
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/** Snapshot of the user's LOCAL weekday (0=Sun..6=Sat) and minutes-since-midnight. */
function localSnapshot(timeZone: string, now: Date): { weekday: number; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = WD[map.weekday ?? ""];
    let hour = parseInt(map.hour ?? "", 10);
    const minute = parseInt(map.minute ?? "", 10);
    if (Number.isNaN(hour) || Number.isNaN(minute) || weekday === undefined) return null;
    if (hour === 24) hour = 0; // en-US hour12:false can render midnight as "24"
    return { weekday, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

/** Parse a Postgres time ('HH:MM' or 'HH:MM:SS') into minutes-since-midnight. */
function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

type OptedInProfile = {
  id: string;
  timezone: string | null;
  daily_drop_time: string | null;
  daily_drop_days: number[] | null;
};

async function runCron(req: Request): Promise<NextResponse> {
  if (process.env.CRON_SECRET && !isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "cron_not_configured" }, { status: 500 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }

  // Opted-in users with the data we need to compute their local schedule.
  const { data, error } = await admin
    .from("profiles")
    .select("id, timezone, daily_drop_time, daily_drop_days")
    .eq("daily_drop_enabled", true)
    .not("timezone", "is", null)
    .not("daily_drop_time", "is", null);

  if (error) {
    return NextResponse.json({ error: "profiles_query_failed" }, { status: 500 });
  }

  const profiles = (data ?? []) as OptedInProfile[];
  const now = new Date();
  const summary = { checked: profiles.length, attempted: 0, prepared: 0, exists: 0, failed: 0, skipped: 0, errors: [] as { userId: string; reason: string }[] };

  for (const p of profiles) {
    const snap = p.timezone ? localSnapshot(p.timezone, now) : null;
    const prefMinutes = timeToMinutes(p.daily_drop_time);
    const days = p.daily_drop_days ?? [0, 1, 2, 3, 4, 5, 6];

    // Skip if we can't compute local time, the weekday is off, or we're outside
    // the [preferred, preferred+WINDOW) window.
    const inWindow =
      snap !== null &&
      prefMinutes !== null &&
      days.includes(snap.weekday) &&
      snap.minutes >= prefMinutes &&
      snap.minutes < prefMinutes + WINDOW_MINUTES;

    if (!inWindow) {
      summary.skipped += 1;
      continue;
    }

    summary.attempted += 1;
    try {
      const result = await prepareDailyDrop(p.id, { supabase: admin, source: "cron" });
      if (result.status === "prepared") summary.prepared += 1;
      else if (result.status === "exists") summary.exists += 1;
      else if (result.status === "failed") {
        summary.failed += 1;
        summary.errors.push({ userId: p.id, reason: result.reason ?? "failed" });
      }
      // "disabled" shouldn't occur (we filtered enabled), but is a no-op here.
    } catch {
      summary.failed += 1;
      summary.errors.push({ userId: p.id, reason: "exception" });
    }
  }

  return NextResponse.json(summary, { status: 200 });
}

export async function GET(req: Request) {
  return runCron(req);
}

export async function POST(req: Request) {
  return runCron(req);
}
