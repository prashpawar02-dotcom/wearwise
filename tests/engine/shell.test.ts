// =====================================================================
// WearWise — Phase 4A shell foundation tests
// Pure logic only (APP_TABS, isTabActive, exceedsViewport) — no React
// import, so this compiles under tsconfig.test.json (no JSX/DOM allowed
// there). Same hand-rolled harness style as golden.test.ts / validity.test.ts.
//   Sandbox: `npm run test:engine`
// =====================================================================
import { APP_TABS, isTabActive } from "@/lib/shell/tabs";
import { SCROLL_BUDGET_FACTOR, exceedsViewport } from "@/lib/shell/scroll-audit";

let passed = 0, failed = 0;
const fails: string[] = [];
function ok(name: string, cond: boolean, extra = "") {
  if (cond) { passed++; console.log(`PASS | ${name}`); }
  else { failed++; fails.push(name); console.log(`FAIL | ${name}${extra ? ` — ${extra}` : ""}`); }
}

// =====================================================================
// 1. Tab config — exactly 5 tabs, correct order, labels, and routes
//    (handoff §1 table). Routes are UNCHANGED existing routes — this is
//    a relabel, not a migration.
// =====================================================================
{
  ok("exactly 5 tabs", APP_TABS.length === 5, `got ${APP_TABS.length}`);
  const expected = [
    { label: "Today", href: "/dashboard" },
    { label: "Wardrobe", href: "/wardrobe" },
    { label: "Style Me", href: "/occasion/new" },
    { label: "Plan", href: "/plan" },
    { label: "You", href: "/profile" },
  ];
  expected.forEach((exp, i) => {
    const tab = APP_TABS[i];
    ok(
      `tab ${i} (${exp.label}) label+href in order`,
      !!tab && tab.label === exp.label && tab.href === exp.href,
      tab ? `got ${tab.label}/${tab.href}` : "missing"
    );
  });
  const keys = new Set(APP_TABS.map((t) => t.key));
  ok("tab keys are unique", keys.size === APP_TABS.length);
}

// =====================================================================
// 2. isTabActive — exact match, nested-route match, no cross-activation
// =====================================================================
{
  const today = APP_TABS.find((t) => t.key === "today")!;
  const wardrobe = APP_TABS.find((t) => t.key === "wardrobe")!;
  const styleme = APP_TABS.find((t) => t.key === "styleme")!;
  const plan = APP_TABS.find((t) => t.key === "plan")!;
  const you = APP_TABS.find((t) => t.key === "you")!;

  ok("Today active on /dashboard (exact)", isTabActive("/dashboard", today));
  ok("Today NOT active on /wardrobe (no cross-activation)", !isTabActive("/wardrobe", today));
  ok("Wardrobe active on /wardrobe (exact)", isTabActive("/wardrobe", wardrobe));
  ok("Style Me active on /occasion/new (exact)", isTabActive("/occasion/new", styleme));
  ok("Style Me active on /occasion/new/xyz (nested route)", isTabActive("/occasion/new/xyz", styleme));
  ok("Plan active on /plan (exact)", isTabActive("/plan", plan));
  ok("Plan NOT active on /planning (prefix false-positive guard)", !isTabActive("/planning", plan));
  ok("You active on /profile (exact)", isTabActive("/profile", you));
  ok("You active on /profile/edit (nested route)", isTabActive("/profile/edit", you));
  ok("Today NOT active on unrelated route", !isTabActive("/lookbook", today));
}

// =====================================================================
// 3. exceedsViewport — scroll budget boundary (§3.2 One-Screen Rule)
// =====================================================================
{
  ok("SCROLL_BUDGET_FACTOR is 1.3", SCROLL_BUDGET_FACTOR === 1.3);
  const viewport = 800;
  ok(
    "content == 1.3x viewport does NOT exceed (boundary inclusive)",
    exceedsViewport(viewport * 1.3, viewport) === false
  );
  ok(
    "content just over 1.3x viewport DOES exceed",
    exceedsViewport(viewport * 1.3 + 1, viewport) === true
  );
  ok("content well under budget does not exceed", exceedsViewport(900, viewport) === false);
  ok("content well over budget exceeds", exceedsViewport(1500, viewport) === true);
  ok("custom factor is respected", exceedsViewport(1000, 800, 1.0) === true);
}

// ---- summary ----
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log("FAILURES:\n - " + fails.join("\n - ")); process.exit(1); }
