// =====================================================================
// WearWise — shared cron helpers (Module D). SERVER-ONLY.
// =====================================================================
import { NextResponse } from "next/server";

/** CRON_SECRET gate, identical semantics to the existing daily-drop cron. */
export function cronUnauthorized(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "cron_not_configured" }, { status: 500 });
  const header = req.headers.get("authorization") ?? "";
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

/** Local minutes-since-midnight + weekday for a timezone; null if invalid. */
export function localNow(timeZone: string, now: Date = new Date()): { weekday: number; minutes: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false,
    }).formatToParts(now);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = WD[map.weekday ?? ""];
    let hour = parseInt(map.hour ?? "", 10);
    const minute = parseInt(map.minute ?? "", 10);
    if (Number.isNaN(hour) || Number.isNaN(minute) || weekday === undefined) return null;
    if (hour === 24) hour = 0;
    return { weekday, minutes: hour * 60 + minute };
  } catch {
    return null;
  }
}

export function timeToMinutes(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Quiet hours: never notify between 21:30 and 06:30 local. */
export function inQuietHours(minutes: number): boolean {
  return minutes >= 21 * 60 + 30 || minutes < 6 * 60 + 30;
}
