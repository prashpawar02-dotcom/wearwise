import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { engineOutfits } from "@/lib/outfit-engine";
import { getFlags } from "@/lib/flags";
import { getEntitlements } from "@/lib/entitlements";
import { sendEmail } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { logAppEvent } from "@/lib/events";
import type { WardrobeItem } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Manual Wardrobe Analysis delivery (Module E — the ₹199 primer).
 * Eligibility: a PAID analysis_purchases row, or Pro quarterly free credit.
 * The report itself is rules-computed from stored tags (0 tokens):
 * colour palette, wardrobe gaps, and 10 outfit combos. Delivered in-app +
 * email. manual_analysis.mode='human' routes it to admin review first.
 */
export async function POST(_req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const rl = await rateLimit(`analysis:${user.id}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ status: "error", reason: "rate_limited" }, { status: 429 });

  const flags = await getFlags();
  if (!flags["manual_analysis.enabled"]) {
    return NextResponse.json({ status: "disabled", message: "Analysis is taking a short break — back soon." });
  }

  const admin = createAdminClient();

  // ---- eligibility: paid purchase awaiting delivery, or Pro quarterly credit ----
  const { data: purchase } = await admin
    .from("analysis_purchases")
    .select("id, status")
    .eq("user_id", user.id)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let viaProCredit = false;
  if (!purchase) {
    const ent = await getEntitlements(user.id);
    if (ent.plan === "pro" && ent.limits.freeAnalysisPerQuarter > 0) {
      const quarterAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
      const { count } = await admin
        .from("analysis_purchases")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "delivered")
        .gte("created_at", quarterAgo);
      viaProCredit = (count ?? 0) === 0;
    }
    if (!viaProCredit) {
      return NextResponse.json({ status: "payment_required", reason: "no_paid_analysis" }, { status: 402 });
    }
  }

  // ---- build the report from stored tags (0 tokens) ----
  const { data: itemsData } = await supabase.from("wardrobe_items").select("*").eq("user_id", user.id);
  const items = (itemsData ?? []) as WardrobeItem[];
  if (items.length < 5) {
    return NextResponse.json({ status: "insufficient", message: "Add at least 5 clothes for a meaningful analysis." });
  }

  const colorCounts = new Map<string, number>();
  const categoryCounts = new Map<string, number>();
  for (const i of items) {
    if (i.color) colorCounts.set(i.color, (colorCounts.get(i.color) ?? 0) + 1);
    if (i.category) categoryCounts.set(i.category, (categoryCounts.get(i.category) ?? 0) + 1);
  }
  const palette = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([c]) => c);

  const gaps: string[] = [];
  const has = (cat: string) => (categoryCounts.get(cat) ?? 0) > 0;
  if (!has("Bottom")) gaps.push("No separate bottoms — a neutral trouser or jeans would multiply your combinations.");
  if (!has("Footwear")) gaps.push("No footwear uploaded — add your shoes so outfits can be completed.");
  if (!has("Outerwear")) gaps.push("No layering piece — one blazer or cardigan makes work looks much stronger.");
  if ((colorCounts.get("Black") ?? 0) + (colorCounts.get("White") ?? 0) + (colorCounts.get("Beige") ?? 0) === 0) {
    gaps.push("Few neutrals — one white/beige base piece would pair with almost everything you own.");
  }
  if (gaps.length === 0) gaps.push("Your wardrobe covers the essentials well — focus on rotation, not shopping.");

  const combos = [
    ...engineOutfits(items, "work", 4),
    ...engineOutfits(items, "casual", 3),
    ...engineOutfits(items, "festive", 3),
  ].slice(0, 10);

  const report = {
    generated_at: new Date().toISOString(),
    item_count: items.length,
    palette,
    gaps,
    combos: combos.map((c) => ({ title: c.title, item_ids: c.item_ids, reason: c.styling_reason })),
  };

  // Human-review mode: park as paid + report attached, admin approves later.
  const human = flags["manual_analysis.mode"] === "human";
  const targetStatus = human ? "paid" : "delivered";

  if (purchase) {
    await admin.from("analysis_purchases").update({
      report,
      status: targetStatus,
      delivered_at: human ? null : new Date().toISOString(),
    }).eq("id", purchase.id);
  } else {
    await admin.from("analysis_purchases").insert({
      user_id: user.id,
      status: targetStatus,
      report,
      delivered_at: human ? null : new Date().toISOString(),
    });
  }

  if (!human) {
    const email = user.email;
    if (email) {
      const combosHtml = report.combos.map((c) => `<li><b>${c.title}</b> — ${c.reason}</li>`).join("");
      await sendEmail(
        email,
        "Your WearWise Wardrobe Analysis ✨",
        `<h2>Your Wardrobe Analysis</h2>
         <p><b>Your palette:</b> ${palette.join(", ") || "—"}</p>
         <p><b>Gaps worth knowing:</b></p><ul>${gaps.map((g) => `<li>${g}</li>`).join("")}</ul>
         <p><b>10 outfit combos from your own closet:</b></p><ul>${combosHtml}</ul>
         <p>Open the app to see each combo with photos.</p>`
      );
    }
    await logAppEvent("analysis_delivered", user.id, { combos: report.combos.length, via_pro_credit: viaProCredit });
  }

  return NextResponse.json({ status: human ? "queued_for_review" : "ok", report: human ? undefined : report });
}
