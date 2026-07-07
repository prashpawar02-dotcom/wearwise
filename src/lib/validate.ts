// =====================================================================
// WearWise — input validation helpers (Module G).
// Dependency-free (the build sandbox cannot install zod; these cover the
// same ground for this app's small input surface: typed, bounded, fail-
// closed parsing of API bodies/params).
// =====================================================================

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[A-Za-z0-9_-]{16,64}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isShareToken(v: unknown): v is string {
  return typeof v === "string" && TOKEN_RE.test(v);
}

export function isTimeHHMM(v: unknown): v is string {
  return typeof v === "string" && TIME_RE.test(v);
}

/** Bounded trimmed string or null. */
export function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Integer within [min, max] or null. */
export function int(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i >= min && i <= max ? i : null;
}

export function bool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

/** Array of UUIDs (bounded length) or null. */
export function uuidArray(v: unknown, maxLen: number): string[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > maxLen) return null;
  return v.every(isUuid) ? (v as string[]) : null;
}

/** Parse a JSON body safely; returns null on malformed/oversized input. */
export async function parseJsonBody(req: Request, maxBytes = 32_768): Promise<Record<string, unknown> | null> {
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    const parsed: unknown = JSON.parse(text || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
