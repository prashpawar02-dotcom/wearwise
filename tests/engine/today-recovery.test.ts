// =====================================================================
// WearWise — Today availability-recovery REGRESSION tests (Phase 5 hotfix).
//
// Defect: marking an item in_wash left Today on a constrained card and Retry
// did nothing. Root cause: the dashboard's REGENERATE call omitted
// `ignoreOptIn`, so prepareDailyDrop returned {status:"disabled",
// recommendation:null} WITHOUT writing for users with daily_drop_enabled=false;
// the stale row stayed and failed final validation. Retry additionally sent no
// `force`, so the route returned the same row ("exists") and re-rendered
// identically.
//
// Pure copy logic is unit-tested; the loader/route/button contracts are proven
// with source assertions (repo wiring-test style — no DOM runner available).
//   Sandbox: `npm run test:engine`
// =====================================================================
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { constrainedCopy, isThinWardrobe } from "@/lib/recommendation/constrained-copy";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8").replace(/\r\n/g, "\n");

// ---------------- Case B: honest constrained copy ----------------
{
  const observed = constrainedCopy({
    blockedNames: ["green graphic tee"],
    blockedReason: "in_wash",
    failReason: "no_valid_outfit",
  });
  ok("copy: names the in-wash item and the real blocker",
    observed === "That green graphic tee is in the wash. I couldn't find another complete clean outfit for today's weather and occasion.", observed);
  ok("copy: no unrelated footwear advice when footwear isn't the blocker", !/shoes|covered/i.test(observed));

  const shoes = constrainedCopy({ blockedNames: ["white sporty shoes"], blockedReason: "in_wash", failReason: "no_available_footwear" });
  ok("copy: footwear advice ONLY when footwear is the genuine blocker", shoes.includes("clean shoes"), shoes);

  const noShoesOwned = constrainedCopy({ failReason: "no_footwear_in_wardrobe" });
  ok("copy: 'no shoes owned' is distinct from 'shoes in the wash'", noShoesOwned.includes("no shoes in your wardrobe"), noShoesOwned);

  const many = constrainedCopy({ blockedNames: ["tee", "pants"], blockedReason: "in_wash", failReason: "no_valid_outfit" });
  ok("copy: multiple blocked items pluralise honestly", many.startsWith("2 pieces from today's outfit are in the wash."), many);

  const noLead = constrainedCopy({ failReason: "no_valid_outfit" });
  ok("copy: no lead when nothing specific became unavailable", noLead.startsWith("I couldn't find another complete"), noLead);

  ok("copy: archived state worded correctly", constrainedCopy({ blockedNames: ["old kurta"], blockedReason: "archived", failReason: "no_valid_outfit" }).includes("is archived"));
  ok("thin wardrobe routes to setup", isThinWardrobe("too_few_wearable_items", 3) && isThinWardrobe(null, 4) && !isThinWardrobe("no_valid_outfit", 30));
}

// ---------------- Case A: automatic recovery in the real loader ----------------
{
  const loader = read("src/app/(app)/dashboard/page.tsx");

  ok("loader: regeneration bypasses the PUSH opt-in (the defect)",
    /prepareDailyDrop\(userId, \{ force: true, supabase, ignoreOptIn: true \}\)/.test(loader));
  ok("loader: stale selected items still trigger regeneration", loader.includes("selectedInvalid"));
  ok("loader: non-writing regeneration outcomes are handled, never silently stale",
    /regenerated\.status === "error"/.test(loader) && /regenerated\.status === "setup_required"/.test(loader));
  ok("loader: one write-producing action per request preserved (writeAttempted)", loader.includes("writeAttempted = true") && (loader.match(/prepareDailyDrop\(/g) ?? []).length === 2);
  ok("loader: final availability validation still runs before render",
    loader.includes("const validity = await validateOutfitCurrent(supabase, userId, ids);"));
  ok("loader: which items dropped out is captured for honest copy", loader.includes("blockedFromStale"));
  ok("loader: constrained copy is reason-derived (not a fixed string)", loader.includes("constrainedCopy({"));
  ok("loader: gem note still gated on a complete authoritative outfit (regression)",
    /rec\.outfit_status === "complete" && missingSlots\.length === 0/.test(loader));
}

// ---------------- Case C: Retry ----------------
{
  const route = read("src/app/api/daily-drop/prepare/route.ts");
  const btn = read("src/app/(app)/dashboard/prepare-drop-button.tsx");

  ok("retry route: explicit user action bypasses the push opt-in", route.includes("ignoreOptIn: true"));
  ok("retry route: user is always taken from the session", route.includes("await supabase.auth.getUser()"));
  ok("retry button: constrained retry FORCES a bounded regeneration", btn.includes("JSON.stringify({ force: compact })"));
  ok("retry button: exactly one prepare request per tap", (btn.match(/fetch\("\/api\/daily-drop\/prepare"/g) ?? []).length === 1);
  ok("retry button: visible loading state", btn.includes('loading ? "Preparing…"'));
  ok("retry button: duplicate submissions blocked while in flight", btn.includes("disabled={loading}"));
  ok("retry button: 'prepared' refreshes to render the new outfit", /status === "prepared"[\s\S]{0,120}router\.refresh\(\)/.test(btn));
  ok("retry button: failed-with-row explains AND refreshes", btn.includes("MSG_STILL_CONSTRAINED"));
  ok("retry button: unchanged result is explained, not silent", btn.includes("MSG_UNCHANGED"));
  ok("retry button: every branch sets a message or refreshes (no silent no-op)",
    !/if \(status === "exists"\) \{\s*router\.refresh\(\);\s*return;\s*\}/.test(btn));
}

// ---------------- Case D + regressions ----------------
{
  const loader = read("src/app/(app)/dashboard/page.tsx");
  ok("restore path: fingerprint comparison still drives staleness", loader.includes("inventory_fingerprint !== currentFingerprint"));
  ok("restore path: a stale row is never rendered without final validation",
    loader.indexOf("const validity = await validateOutfitCurrent(supabase, userId, ids);") < loader.indexOf("const members: WardrobeItem[] = validity.items;"));
  const wear = read("src/app/api/daily-drop/wear/route.ts");
  ok("regression: atomic Wore-It still has no direct table writes",
    !wear.includes('.from("daily_recommendations")') && !wear.includes('.from("wardrobe_items")'));
  const swap = read("src/app/api/daily-drop/swap/route.ts");
  ok("regression: swap still separate from another-option", swap.includes("lockAndReplaceCandidates") && !swap.includes("another-option"));
}

console.log(`\n${passed} passed / ${failed} failed`);
if (failed) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
process.exit(0);
