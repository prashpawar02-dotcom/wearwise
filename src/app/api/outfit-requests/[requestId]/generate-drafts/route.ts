import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  buildOutfitPrompt,
  cleanSuggestions,
  MIN_ITEMS_FOR_DRAFTS,
  type CleanSuggestion,
} from "@/lib/outfit-drafts";
import { validateOutfitByIds, type RoleClassifiableItem } from "@/lib/outfitValidation";
import type { WardrobeItem } from "@/lib/types";
import { logAiUsage } from "@/lib/ai-costs";

export const runtime = "nodejs";
export const maxDuration = 60;

const DRAFT_MODEL = "gpt-4o-mini";

// Structures we ask the model to stick to on a regeneration pass.
const RETRY_NOTE =
  "Your previous answer contained invalid combinations. Every look MUST be exactly one of: " +
  "(a) one top + one bottom, (b) one one-piece (dress/saree/gown/anarkali/jumpsuit) alone, " +
  "or (c) kurta + bottom (+ optional dupatta). Never use two upper-body garments, never two kurtas, " +
  "and never a kurta with a t-shirt/top/shirt.";

export async function POST(_req: Request, { params }: { params: { requestId: string } }) {
  const supabase = createClient();

  // ---- Admin only ----
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "error", reason: "unauthorized" }, { status: 401 });

  const { data: me } = await supabase
    .from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ status: "error", reason: "forbidden" }, { status: 403 });

  // ---- Load the request (admin RLS allows) ----
  const { data: request } = await supabase
    .from("outfit_requests").select("*").eq("id", params.requestId).single();
  if (!request) return NextResponse.json({ status: "error", reason: "not_found" }, { status: 404 });

  // ---- Load the requesting user's wardrobe ----
  const { data: itemsData } = await supabase
    .from("wardrobe_items").select("*").eq("user_id", request.user_id);
  const items = (itemsData ?? []) as WardrobeItem[];

  if (items.length < MIN_ITEMS_FOR_DRAFTS) {
    return NextResponse.json({
      status: "insufficient",
      message: "Not enough wardrobe items to generate strong outfit drafts. Ask user to upload more clothes.",
    });
  }

  const apiKey = process.env.OPENAI_API_KEY; // server-side ONLY
  if (!apiKey) {
    return NextResponse.json({ status: "error", reason: "no_api_key" });
  }

  const validIds = new Set(items.map((i) => i.id));
  const itemsById = new Map<string, RoleClassifiableItem>(items.map((i) => [i.id, i]));

  // One OpenAI call -> cleaned suggestions. Meters its own usage (cost is
  // incurred whether or not the result passes structure validation).
  async function callModel(retryNote?: string): Promise<CleanSuggestion[]> {
    const startedAt = Date.now();
    const prompt = buildOutfitPrompt(request.occasion, request.notes, items, retryNote);
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: DRAFT_MODEL,
        temperature: 0.5,
        max_tokens: 900,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return only valid JSON matching the requested schema." },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!resp.ok) throw new Error(`openai_${resp.status}`);

    const json = await resp.json();
    const usage = (json?.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
    await logAiUsage({
      supabase,
      userId: request.user_id,
      feature: "outfit_draft_generation",
      targetId: params.requestId,
      model: DRAFT_MODEL,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      imageCount: 0,
      status: "success",
      latencyMs: Date.now() - startedAt,
    });

    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try { parsed = JSON.parse(content); } catch { throw new Error("bad_json"); }
    return cleanSuggestions(parsed, validIds);
  }

  // Keep only structurally valid looks (no kurta+kurta, no kurta+top, etc.).
  function keepValid(list: CleanSuggestion[]): CleanSuggestion[] {
    return list.filter((s) => validateOutfitByIds(s.item_ids, itemsById).valid);
  }

  try {
    let valid = keepValid(await callModel());

    // If the first pass didn't yield 3 valid looks, regenerate once with a
    // stricter instruction, then merge (de-duplicated by item set).
    if (valid.length < 3) {
      const more = keepValid(await callModel(RETRY_NOTE));
      const seen = new Set(valid.map((s) => [...s.item_ids].sort().join("|")));
      for (const s of more) {
        const key = [...s.item_ids].sort().join("|");
        if (!seen.has(key)) { seen.add(key); valid.push(s); }
        if (valid.length >= 3) break;
      }
    }

    valid = valid.slice(0, 3);
    if (valid.length === 0) throw new Error("no_valid_suggestions");

    // Replace existing DRAFT suggestions for this request (keep any approved ones).
    await supabase
      .from("outfit_suggestions")
      .delete()
      .eq("request_id", params.requestId)
      .eq("status", "draft");

    const rows = valid.map((s, i) => ({
      request_id: params.requestId,
      user_id: request.user_id,
      title: s.title,
      description: s.styling_reason,
      avoid_note: s.avoid_note,
      missing_item_suggestion: s.missing_item_suggestion,
      item_ids: s.item_ids,
      ai_confidence: s.confidence,
      source: "ai",
      status: "draft" as const,
      position: i + 1,
    }));

    const { error: insErr } = await supabase.from("outfit_suggestions").insert(rows);
    if (insErr) throw new Error("insert_failed");

    // Drafts are NOT approved — move request to in_review for the admin queue.
    await supabase.from("outfit_requests").update({ status: "in_review" }).eq("id", params.requestId);

    return NextResponse.json({ status: "ok", count: rows.length });
  } catch (err) {
    // Meter the failed call (tokens unknown => cost stored as null).
    await logAiUsage({
      supabase,
      userId: request?.user_id ?? null,
      feature: "outfit_draft_generation",
      targetId: params.requestId,
      model: DRAFT_MODEL,
      imageCount: 0,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "unknown",
      latencyMs: null,
    });

    // Admin-only error; never surfaced to the end user.
    return NextResponse.json({
      status: "error",
      reason: err instanceof Error ? err.message : "unknown",
    });
  }
}
