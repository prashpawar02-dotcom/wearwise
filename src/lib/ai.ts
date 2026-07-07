// =====================================================================
// WearWise — AI escalation path (Module A/B). Called ONLY when the
// deterministic engine (lib/outfit-engine.ts) can't fill a request.
// Enforces, in order:
//   1. eco_mode flag        → no live calls at all
//   2. ai.daily_budget      → global INR/day estimated-spend ceiling
//   3. ai.per_user_daily_cap→ per-user live-call ceiling
//   4. memoization          → identical inputs return the cached output
// Every allowed call is metered via logAiUsage and mirrored to app_events.
// SERVER-ONLY.
// =====================================================================
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase-admin";
import { getFlags } from "@/lib/flags";
import { logAppEvent } from "@/lib/events";
import { logAiUsage, USD_TO_INR } from "@/lib/ai-costs";
import { buildOutfitPrompt, cleanSuggestions, type CleanSuggestion } from "@/lib/outfit-drafts";
import type { Occasion, WardrobeItem } from "@/lib/types";

const MODEL = "gpt-4o-mini";

export type AiDenyReason = "eco_mode" | "budget_exceeded" | "user_cap_exceeded" | "no_api_key";

export interface AiGenResult {
  suggestions: CleanSuggestion[];
  /** true when the result came from the memo cache (zero tokens). */
  cached: boolean;
  denied?: AiDenyReason;
}

/** Stable hash of the generation inputs for memoization. */
export function generationHash(userId: string, items: WardrobeItem[], occasion: Occasion, extra = ""): string {
  // wardrobe_version: ids + tag-relevant fields, order-independent.
  const version = items
    .map((i) => `${i.id}:${i.category}:${i.color}:${i.pattern}:${i.availability_status}`)
    .sort()
    .join(",");
  return createHash("sha256").update(`${userId}|${occasion}|${extra}|${version}`).digest("hex");
}

async function todaysAiSpendInr(): Promise<number> {
  try {
    const admin = createAdminClient();
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { data } = await admin
      .from("ai_usage_logs")
      .select("estimated_cost_usd")
      .gte("created_at", since.toISOString());
    const usd = (data ?? []).reduce((s, r) => s + (Number(r.estimated_cost_usd) || 0), 0);
    return usd * USD_TO_INR;
  } catch {
    return 0;
  }
}

async function userCallsToday(userId: string): Promise<number> {
  try {
    const admin = createAdminClient();
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count } = await admin
      .from("ai_usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Generate outfit suggestions with the LLM, behind every cost control.
 * Returns { suggestions: [] , denied } when a guardrail blocks the call —
 * callers fall back to rules-only and tell the user honestly.
 */
export async function aiOutfits(
  userId: string,
  items: WardrobeItem[],
  occasion: Occasion,
  notes: string | null,
  retryNote?: string
): Promise<AiGenResult> {
  const flags = await getFlags();

  if (flags.eco_mode) {
    await logAppEvent("ai_denied", userId, { reason: "eco_mode" });
    return { suggestions: [], cached: false, denied: "eco_mode" };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { suggestions: [], cached: false, denied: "no_api_key" };

  // ---- memo cache (zero tokens on identical inputs) ----
  const admin = createAdminClient();
  const hash = generationHash(userId, items, occasion, notes ?? "");
  try {
    const { data: memo } = await admin
      .from("generation_cache").select("output").eq("input_hash", hash).maybeSingle();
    if (memo?.output) {
      return { suggestions: memo.output as CleanSuggestion[], cached: true };
    }
  } catch { /* cache miss path continues */ }

  // ---- budget guards ----
  if ((await todaysAiSpendInr()) >= flags["ai.daily_budget"]) {
    await logAppEvent("ai_denied", userId, { reason: "budget_exceeded" });
    return { suggestions: [], cached: false, denied: "budget_exceeded" };
  }
  if ((await userCallsToday(userId)) >= flags["ai.per_user_daily_cap"]) {
    await logAppEvent("ai_denied", userId, { reason: "user_cap_exceeded" });
    return { suggestions: [], cached: false, denied: "user_cap_exceeded" };
  }

  // ---- one compact live call ----
  const startedAt = Date.now();
  const prompt = buildOutfitPrompt(occasion, notes, items, retryNote);
  const validIds = new Set(items.map((i) => i.id));
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
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
      supabase: admin,
      userId,
      feature: "outfit_draft_generation",
      model: MODEL,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      status: "success",
      latencyMs: Date.now() - startedAt,
    });
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";
    const suggestions = cleanSuggestions(JSON.parse(content), validIds);
    // memoize (best-effort)
    try {
      await admin.from("generation_cache").upsert({ input_hash: hash, user_id: userId, output: suggestions });
    } catch { /* non-fatal */ }
    return { suggestions, cached: false };
  } catch (err) {
    await logAiUsage({
      supabase: admin,
      userId,
      feature: "outfit_draft_generation",
      model: MODEL,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "unknown",
    });
    return { suggestions: [], cached: false };
  }
}
