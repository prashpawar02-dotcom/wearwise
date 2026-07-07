// =====================================================================
// WearWise — rate limiting (Module G).
// Fixed-window limiter. Uses Upstash Redis over REST when configured
// (UPSTASH_REDIS_REST_URL/TOKEN) so limits hold across serverless
// instances; otherwise falls back to a per-instance in-memory window,
// which still blunts bursts and abuse loops.
// =====================================================================

const memory = new Map<string, { count: number; resetAt: number }>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
}

function memoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const slot = memory.get(key);
  if (!slot || slot.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  slot.count += 1;
  if (memory.size > 10_000) memory.clear(); // hard memory cap
  return { ok: slot.count <= limit, remaining: Math.max(0, limit - slot.count) };
}

async function upstashLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const windowKey = `rl:${key}:${Math.floor(Date.now() / windowMs)}`;
    const resp = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", windowKey],
        ["PEXPIRE", windowKey, String(windowMs)],
      ]),
      cache: "no-store",
    });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { result?: number }[];
    const count = Number(json?.[0]?.result ?? 0);
    return { ok: count <= limit, remaining: Math.max(0, limit - count) };
  } catch {
    return null; // fall back to memory
  }
}

/**
 * `key` should combine route + principal, e.g. `vote:${ip}` or `ai:${userId}`.
 * Fail-open on limiter infrastructure errors, fail-closed on real overuse.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const up = await upstashLimit(key, limit, windowMs);
  return up ?? memoryLimit(key, limit, windowMs);
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd ? fwd.split(",")[0].trim() : null) || req.headers.get("x-real-ip") || "unknown";
}
