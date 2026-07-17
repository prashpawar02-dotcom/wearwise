// =====================================================================
// WearWise — Migration 0028 (public.outfit_requests privileges + RLS) guard.
// SOURCE-STRUCTURE assertions over the 0028 up/down SQL and the outfit-request
// code, proving the least-privilege matrix, the command-specific owner/admin
// RLS, and that no manual Studio grant is needed after db reset. HONESTY: these
// prove the SQL shape only — real executed proof (a real authenticated session
// insert/select + cross-owner denial) lives in
// scripts/test-outfit-request-privileges-local.mjs
// (`npm run test:outfit-request-privileges:local`).
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync, existsSync } from "node:fs";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}
const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const UP_PATH = "supabase/migrations/0028_outfit_request_privileges.sql";
const DOWN_PATH = "supabase/rollbacks/0028_outfit_request_privileges_down.sql";

ok("0028 forward migration exists in supabase/migrations (applied by db reset)", existsSync(UP_PATH));
ok("0028 rollback exists in supabase/rollbacks (not run by db reset)", existsSync(DOWN_PATH));

const up = existsSync(UP_PATH) ? read(UP_PATH) : "";
const down = existsSync(DOWN_PATH) ? read(DOWN_PATH) : "";

// --- Table privileges: revoke baseline from every client-facing role ---
for (const role of ["public", "anon", "authenticated", "service_role"]) {
  ok(`0028 revokes all on outfit_requests from ${role}`, up.includes(`revoke all on table public.outfit_requests from ${role};`));
}

// authenticated: SELECT, INSERT, UPDATE — no DELETE/TRUNCATE/TRIGGER/REFERENCES.
ok("authenticated gets SELECT, INSERT, UPDATE", up.includes("grant select, insert, update on table public.outfit_requests to authenticated;"));
ok("authenticated is NOT granted delete/truncate/trigger/references",
  !/grant[^;]*\b(delete|truncate|trigger|references)\b[^;]*on table public\.outfit_requests[^;]*to authenticated/i.test(up));
ok("no GRANT ALL to authenticated on outfit_requests", !/grant all on table public\.outfit_requests to authenticated/i.test(up));

// service_role: UPDATE only.
{
  const svc = up.split("\n").filter((l) => /grant\s+.*on table public\.outfit_requests\s+to service_role;/i.test(l));
  ok("service_role has exactly ONE grant line on outfit_requests", svc.length === 1, JSON.stringify(svc));
  ok("service_role grant is UPDATE only (no select/insert/delete/truncate/trigger/references/all)",
    svc.length === 1 && /grant update on table public\.outfit_requests to service_role;/i.test(svc[0]) &&
    !/\b(select|insert|delete|truncate|trigger|references|all)\b/i.test(svc[0]), JSON.stringify(svc));
}

// anon: no grant.
ok("anon receives NO grant on outfit_requests", !/grant[^;]*on table public\.outfit_requests[^;]*to anon/i.test(up));

// Schema USAGE + no sequence grant.
ok("schema USAGE granted to authenticated + service_role",
  up.includes("grant usage on schema public to authenticated;") && up.includes("grant usage on schema public to service_role;"));
ok("no sequence privilege granted (uuid PK, none required)", !/grant[^;]*on sequence/i.test(up));

// --- RLS: command-specific policies replace the broad ALL policies ---
ok("broad 'requests_owner_all' policy is dropped", up.includes('drop policy if exists "requests_owner_all" on public.outfit_requests;'));
ok("broad 'requests_admin_rw' policy is dropped", up.includes('drop policy if exists "requests_admin_rw" on public.outfit_requests;'));
ok("owner INSERT policy is command-specific, TO authenticated, WITH CHECK own",
  /create policy "requests_owner_insert" on public\.outfit_requests\s*\n\s*for insert to authenticated\s*\n\s*with check \(user_id = auth\.uid\(\)\);/i.test(up));
ok("owner SELECT policy is command-specific, TO authenticated, USING own",
  /create policy "requests_owner_select" on public\.outfit_requests\s*\n\s*for select to authenticated\s*\n\s*using \(user_id = auth\.uid\(\)\);/i.test(up));
ok("admin curation policy is is_admin()-gated, TO authenticated",
  /create policy "requests_admin_all" on public\.outfit_requests\s*\n\s*for all to authenticated\s*\n\s*using \(public\.is_admin\(\)\)\s*\n\s*with check \(public\.is_admin\(\)\);/i.test(up));
ok("no owner UPDATE/DELETE policy is added (not proven required for non-admins)",
  !/create policy "requests_owner_(update|delete)"/i.test(up));

// --- Rollback restores the pre-0028 broad policies + baseline ---
ok("rollback revokes authenticated select/insert/update", down.includes("revoke select, insert, update on table public.outfit_requests from authenticated;"));
ok("rollback revokes service_role update", down.includes("revoke update on table public.outfit_requests from service_role;"));
ok("rollback restores baseline references/trigger/truncate to the three roles",
  down.includes("grant references, trigger, truncate on table public.outfit_requests to anon;") &&
  down.includes("grant references, trigger, truncate on table public.outfit_requests to authenticated;") &&
  down.includes("grant references, trigger, truncate on table public.outfit_requests to service_role;"));
ok("rollback restores the original broad 'requests_owner_all' and 'requests_admin_rw' policies",
  down.includes('create policy "requests_owner_all" on public.outfit_requests') &&
  down.includes('create policy "requests_admin_rw" on public.outfit_requests'));

// --- Unrelated privilege migrations remain untouched ---
ok("0028 does not touch other tables' privileges",
  !/public\.(profiles|wardrobe_items|daily_recommendations|streaks)\b/i.test(up));

// --- Code corroboration: proven operations & clients ---
{
  const form = read("src/app/(app)/occasion/new/occasion-form.tsx");
  const gen = read("src/app/api/outfit-requests/[requestId]/generate/route.ts");
  ok("Style Me form inserts own request (user_id) and returns id via the browser client",
    form.includes('from "@/lib/supabase/client"') && form.includes('.from("outfit_requests")') &&
    /\.insert\(\{ user_id: user\.id/.test(form) && form.includes('.select("id")'));
  ok("service_role UPDATE (status) is proven in the generate route (no .select() → return=minimal)",
    /admin\s*\n?\s*\.from\("outfit_requests"\)\s*\n?\s*\.update\(/.test(gen));
  ok("no code deletes outfit_requests (authenticated or service_role)",
    !/\.from\("outfit_requests"\)\.delete\(/.test(form + gen + read("src/app/admin/requests/[requestId]/suggestion-builder.tsx")));
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
