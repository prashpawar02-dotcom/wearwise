// =====================================================================
// WearWise — Content-Security-Policy dev/prod guard (Phase 4 hardening)
// Executes the REAL next.config.mjs under NODE_ENV=development and
// NODE_ENV=production (in a child node ESM process) and asserts the actual
// emitted CSP. Proves local Supabase origins are dev-only and never leak into
// production, and that no unrelated directive is weakened.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { spawnSync } from "node:child_process";
import { join } from "node:path";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

const CONFIG = join(process.cwd(), "next.config.mjs");
const CHILD = [
  "import { pathToFileURL } from 'node:url';",
  "const m = await import(pathToFileURL(process.env.CFG).href);",
  "const r = await m.default.headers();",
  "const csp = r[0].headers.find(h => h.key === 'Content-Security-Policy').value;",
  "process.stdout.write(csp);",
].join("\n");

function cspFor(env: string): string {
  const res = spawnSync(process.execPath, ["--input-type=module", "-e", CHILD], {
    env: { ...process.env, NODE_ENV: env, CFG: CONFIG } as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  if ((res.status ?? 1) !== 0) { console.error(res.stderr); throw new Error(`config eval failed for NODE_ENV=${env}`); }
  return res.stdout.trim();
}
function directive(csp: string, name: string): string {
  return csp.split(";").map((s) => s.trim()).find((s) => s.startsWith(name + " ")) ?? "";
}

const dev = cspFor("development");
const prod = cspFor("production");
const devConnect = directive(dev, "connect-src");
const devImg = directive(dev, "img-src");
const prodConnect = directive(prod, "connect-src");
const prodImg = directive(prod, "img-src");

// --- Development CSP includes the local Supabase stack ---
ok("dev connect-src includes local Supabase HTTP API (127.0.0.1)", devConnect.includes("http://127.0.0.1:54321"));
ok("dev connect-src includes local Supabase HTTP API (localhost)", devConnect.includes("http://localhost:54321"));
ok("dev connect-src includes local Supabase WebSocket (127.0.0.1)", devConnect.includes("ws://127.0.0.1:54321"));
ok("dev connect-src includes local Supabase WebSocket (localhost)", devConnect.includes("ws://localhost:54321"));
ok("dev img-src includes local Storage origin (127.0.0.1)", devImg.includes("http://127.0.0.1:54321"));
ok("dev img-src includes local Storage origin (localhost)", devImg.includes("http://localhost:54321"));

// --- Production CSP excludes every local origin ---
for (const bad of ["localhost", "127.0.0.1", "http://localhost", "ws://localhost", "http://127.0.0.1", "ws://127.0.0.1"]) {
  ok(`prod CSP does NOT include ${bad}`, !prod.includes(bad));
}

// --- Production retains hosted Supabase origins ---
ok("prod connect-src retains hosted https Supabase", prodConnect.includes("https://*.supabase.co"));
ok("prod connect-src retains hosted wss Supabase", prodConnect.includes("wss://*.supabase.co"));
ok("prod img-src retains hosted https Supabase", prodImg.includes("https://*.supabase.co"));

// --- Unrelated directives not weakened (both envs) ---
for (const d of [
  "default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  "frame-src https://api.razorpay.com https://checkout.razorpay.com",
]) {
  ok(`prod CSP retains "${d}"`, prod.includes(d));
  ok(`dev CSP retains "${d}"`, dev.includes(d));
}

// --- No broad wildcard origins introduced ---
for (const w of ["http://*", "ws://*"]) {
  ok(`no broad wildcard ${w} in dev`, !dev.includes(w));
  ok(`no broad wildcard ${w} in prod`, !prod.includes(w));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
