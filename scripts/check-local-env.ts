/**
 * Local preflight — environment sanity check.
 * ------------------------------------------------------------------
 * Verifies that the variables the app and tooling need are present, WITHOUT
 * ever printing a secret value. Safe to run anytime.
 *
 * Run (loads .env.local):
 *   npx tsx --env-file=.env.local scripts/check-local-env.ts
 *
 * Exit code is 1 if a required variable is missing or a safety rule is
 * violated; 0 otherwise. A blocked network check does NOT fail the script —
 * it's expected in restricted sandboxes.
 *
 * Note: all logic runs inside async main() (no top-level await) so it works
 * under tsx's default CommonJS output.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

type Status = "ok" | "warn" | "fail";
let worstFail = false;

function line(status: Status, label: string, detail = ""): void {
  const mark = status === "ok" ? "[ok]  " : status === "warn" ? "[warn]" : "[FAIL]";
  if (status === "fail") worstFail = true;
  console.log(`${mark} ${label}${detail ? ` — ${detail}` : ""}`);
}

/** Report only whether a var is set (never its value). */
function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/** Cheap recursive scan for a literal string in source files. */
function scanFor(needle: string, dir: string): string[] {
  const hits: string[] = [];
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return hits;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      hits.push(...scanFor(needle, full));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) {
      try {
        if (readFileSync(full, "utf8").includes(needle)) hits.push(full);
      } catch {
        /* ignore unreadable file */
      }
    }
  }
  return hits;
}

/** Optional reachability check — reports only, never fails the preflight. */
async function checkReachability(url: string, urlOk: boolean): Promise<void> {
  if (!urlOk) {
    line("warn", "skipped", "Supabase URL not valid");
    return;
  }
  const target = `${url.replace(/\/$/, "")}/auth/v1/health`;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(4000) });
    line("ok", "Supabase reachable", `HTTP ${res.status}`);
  } catch (err) {
    const code =
      (err as { cause?: { code?: string }; name?: string })?.cause?.code ??
      (err as Error)?.name ??
      "error";
    line("warn", "Supabase NOT reachable from here", `${code} — expected in a restricted sandbox; run locally`);
  }
}

async function main(): Promise<void> {
  console.log("\nWearWise local environment preflight");
  console.log("------------------------------------");
  console.log("(secret values are never printed)\n");

  // ---- Required for the app to run ---------------------------------------
  const REQUIRED = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SITE_URL",
  ];
  for (const name of REQUIRED) {
    line(present(name) ? "ok" : "fail", name, present(name) ? "set" : "missing");
  }

  // ---- Required for AI features (tagging + outfit drafts) -----------------
  line(
    present("OPENAI_API_KEY") ? "ok" : "warn",
    "OPENAI_API_KEY",
    present("OPENAI_API_KEY") ? "set (server-side)" : "missing — auto-tagging / drafts will fail"
  );

  // ---- Optional: only the audit scripts need the service-role key ---------
  line(
    present("SUPABASE_SERVICE_ROLE_KEY") ? "ok" : "warn",
    "SUPABASE_SERVICE_ROLE_KEY",
    present("SUPABASE_SERVICE_ROLE_KEY")
      ? "set (audit scripts only — local-only, never ships)"
      : "not set — fine unless running an audit script"
  );

  // ---- Safety rules ------------------------------------------------------
  console.log("\nSafety checks");
  console.log("-------------");

  // 1) No secret may be exposed to the browser via NEXT_PUBLIC_*.
  const leakedPublic = Object.keys(process.env).filter(
    (k) => k.startsWith("NEXT_PUBLIC_") && /(SERVICE_ROLE|SECRET|OPENAI|PRIVATE)/i.test(k)
  );
  line(
    leakedPublic.length === 0 ? "ok" : "fail",
    "no secrets exposed as NEXT_PUBLIC_*",
    leakedPublic.length === 0 ? "" : `offending: ${leakedPublic.join(", ")}`
  );

  // 2) The service-role key must never be referenced from src/ (it bypasses
  //    RLS and must stay in scripts/ only).
  const srcLeaks = scanFor("SUPABASE_SERVICE_ROLE_KEY", join(process.cwd(), "src"));
  line(
    srcLeaks.length === 0 ? "ok" : "fail",
    "service-role key not referenced in src/",
    srcLeaks.length === 0 ? "" : `found in: ${srcLeaks.join(", ")}`
  );

  // 3) Supabase URL looks like a URL.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let urlOk = false;
  try {
    const u = new URL(url);
    urlOk = u.protocol === "https:" || u.protocol === "http:";
  } catch {
    urlOk = false;
  }
  line(urlOk ? "ok" : "fail", "NEXT_PUBLIC_SUPABASE_URL is a valid URL");

  // ---- Optional reachability check (never fails the script) --------------
  console.log("\nNetwork reachability (informational)");
  console.log("------------------------------------");
  await checkReachability(url, urlOk);

  console.log("");
  if (worstFail) {
    console.error("Preflight FAILED — fix the [FAIL] items above before building/deploying.\n");
    process.exit(1);
  }
  console.log("Preflight OK.\n");
}

void main().catch((error) => {
  console.error("Preflight failed unexpectedly.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
