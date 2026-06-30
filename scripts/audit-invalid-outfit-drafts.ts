/**
 * One-time maintenance audit — invalid outfit suggestions.
 * ------------------------------------------------------------------
 * Outfit suggestions created BEFORE the structure validator existed may be
 * physically impossible (e.g. kurta + kurta, kurta + t-shirt, a dress with a
 * separate top). This script finds them using the SAME logic the app now uses
 * (src/lib/outfitValidation.ts).
 *
 * Safety model:
 *   - DRY RUN by default: reads only, mutates nothing.
 *   - `--fix` marks invalid *draft* suggestions as 'rejected' (the safest,
 *     reversible action — drafts are never shown to users anyway).
 *   - APPROVED invalid suggestions are reported SEPARATELY as HIGH PRIORITY and
 *     are NEVER auto-changed — a human must re-curate them.
 *
 * How to run (loads .env.local for the Supabase service-role key):
 *   npx tsx --env-file=.env.local scripts/audit-invalid-outfit-drafts.ts
 *   npx tsx --env-file=.env.local scripts/audit-invalid-outfit-drafts.ts --fix
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY so it can see every user's rows (bypassing
 * RLS). The key is read from the environment and is never printed or logged.
 * This is a local CLI tool; it is not imported by the app and never ships to
 * the browser.
 */
import { createClient } from "@supabase/supabase-js";
import { validateOutfitItems, type RoleClassifiableItem } from "@/lib/outfitValidation";

interface SuggestionRow {
  id: string;
  user_id: string | null;
  request_id: string | null;
  title: string | null;
  status: string;
  source: string | null;
  item_ids: string[] | null;
  created_at: string;
}

interface ItemRow {
  id: string;
  category: string | null;
  sub_category: string | null;
  user_facing_name: string | null;
}

interface Flagged {
  row: SuggestionRow;
  reason: string;
}

const FIX = process.argv.includes("--fix");

function fail(message: string): never {
  console.error(`\n[x] ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) fail("NEXT_PUBLIC_SUPABASE_URL is not set.");
  if (!serviceKey) {
    fail(
      "SUPABASE_SERVICE_ROLE_KEY is not set. It is required to read all users' rows. " +
        "Add it to .env.local (server-side only — never commit it)."
    );
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Only draft (pending) + approved matter. Rejected/archived need no action.
  const { data: suggData, error: sErr } = await supabase
    .from("outfit_suggestions")
    .select("id,user_id,request_id,title,status,source,item_ids,created_at")
    .in("status", ["draft", "approved"]);
  if (sErr) fail(`Could not load outfit_suggestions: ${sErr.message}`);
  const suggestions = (suggData ?? []) as SuggestionRow[];

  // Load every referenced wardrobe item once (chunked IN queries).
  const allItemIds = new Set<string>();
  for (const s of suggestions) for (const id of s.item_ids ?? []) allItemIds.add(id);

  const itemsById = new Map<string, ItemRow>();
  const ids = Array.from(allItemIds);
  const CHUNK = 200;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const slice = ids.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("wardrobe_items")
      .select("id,category,sub_category,user_facing_name")
      .in("id", slice);
    if (error) fail(`Could not load wardrobe_items: ${error.message}`);
    for (const it of (data ?? []) as ItemRow[]) itemsById.set(it.id, it);
  }

  const describe = (id: string): string => {
    const it = itemsById.get(id);
    if (!it) return `${id} (item not found)`;
    const name = it.user_facing_name ?? it.sub_category ?? "unnamed";
    return `${name} [${it.category ?? "uncategorized"}]`;
  };

  let valid = 0;
  let skippedEmpty = 0;
  const invalidDrafts: Flagged[] = [];
  const invalidApproved: Flagged[] = [];

  for (const s of suggestions) {
    const itemIds = s.item_ids ?? [];
    // A blank manual draft (no items yet) is not a structural bug — skip it.
    if (itemIds.length === 0) {
      skippedEmpty++;
      continue;
    }
    const items: RoleClassifiableItem[] = itemIds
      .map((id) => itemsById.get(id))
      .filter((x): x is ItemRow => Boolean(x));

    const result = validateOutfitItems(items);
    if (result.valid) {
      valid++;
      continue;
    }
    const entry: Flagged = { row: s, reason: result.reason ?? "invalid structure" };
    if (s.status === "approved") invalidApproved.push(entry);
    else invalidDrafts.push(entry);
  }

  // ---------------- Report ----------------
  const rule = (n = 64) => console.log("-".repeat(n));
  console.log(`\nWearWise — invalid outfit audit  ${FIX ? "(FIX MODE)" : "(dry run)"}`);
  rule();
  console.log(`Total checked      : ${suggestions.length}  (draft + approved)`);
  console.log(`Valid              : ${valid}`);
  console.log(`Empty drafts (skip): ${skippedEmpty}`);
  console.log(`Invalid drafts     : ${invalidDrafts.length}`);
  console.log(
    `Invalid APPROVED   : ${invalidApproved.length}${invalidApproved.length ? "   <-- HIGH PRIORITY" : ""}`
  );
  rule();

  const printGroup = (heading: string, rows: Flagged[]) => {
    if (rows.length === 0) return;
    console.log(`\n${heading}`);
    for (const { row, reason } of rows) {
      const items = (row.item_ids ?? []).map(describe).join(", ") || "(no items)";
      console.log(`  - ${row.id}  [${row.status}, ${row.source ?? "?"}]  user=${row.user_id ?? "?"}`);
      console.log(`      request : ${row.request_id ?? "?"}`);
      console.log(`      reason  : ${reason}`);
      console.log(`      items   : ${items}`);
    }
  };

  printGroup("INVALID APPROVED (users may see these — re-curate manually):", invalidApproved);
  printGroup("INVALID DRAFTS:", invalidDrafts);

  // ---------------- Fix (opt-in) ----------------
  if (!FIX) {
    console.log(
      `\nDry run only. Re-run with --fix to mark the ${invalidDrafts.length} invalid DRAFT(s) as 'rejected'.`
    );
    if (invalidApproved.length > 0) {
      console.log("\nApproved invalid suggestions are NOT auto-changed. Re-curate these IDs manually:");
      for (const x of invalidApproved) console.log(`  ${x.row.id}`);
    }
    return;
  }

  if (invalidDrafts.length === 0) {
    console.log("\nNothing to fix (no invalid drafts).");
  } else {
    const draftIds = invalidDrafts.map((x) => x.row.id);
    const { error } = await supabase
      .from("outfit_suggestions")
      .update({ status: "rejected" })
      .in("id", draftIds)
      .eq("status", "draft"); // safety: only flip rows still in draft
    if (error) fail(`Fix failed: ${error.message}`);
    console.log(`\n[ok] Marked ${draftIds.length} invalid draft(s) as 'rejected'.`);
  }

  if (invalidApproved.length > 0) {
    console.log(
      `\n[!] ${invalidApproved.length} APPROVED invalid suggestion(s) were left untouched (manual re-curation required):`
    );
    for (const x of invalidApproved) console.log(`  ${x.row.id}`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
