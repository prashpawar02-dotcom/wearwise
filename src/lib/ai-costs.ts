// =====================================================================
// WearWise — AI cost constants + usage logging (v0.5)
// Server-side only. Never imported into client components.
//
// This file is the single source of truth for:
//   - OpenAI model pricing
//   - the USD -> INR rate used by the admin dashboard
//   - estimateOpenAICostUsd()
//   - logAiUsage()  (best-effort; never throws, never breaks a route)
//
// It NEVER touches the OpenAI key, image bytes, prompts, or user notes.
// =====================================================================
import type { SupabaseClient } from "@supabase/supabase-js";

/** Hardcoded display rate for the admin dashboard. Update manually for now. */
export const USD_TO_INR = 85;

export type AiFeature = "wardrobe_autotag" | "outfit_draft_generation";

/** Price per 1,000,000 tokens, in USD. Source: OpenAI API pricing (2026). */
interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
}

const MODEL_PRICES: Record<string, ModelPrice> = {
  // gpt-4o-mini: $0.15 / 1M input, $0.60 / 1M output.
  "gpt-4o-mini": { inputPerM: 0.15, outputPerM: 0.6 },
};

/**
 * Estimate the USD cost of one OpenAI call from token counts.
 * Returns null when the model is unknown OR when no tokens were reported
 * (so the caller can store estimated_cost_usd = null rather than a fake 0).
 */
export function estimateOpenAICostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  if (!inputTokens && !outputTokens) return null;
  const cost =
    (inputTokens / 1_000_000) * price.inputPerM +
    (outputTokens / 1_000_000) * price.outputPerM;
  // Round to 6 dp to match numeric(10,6) in the DB.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

export interface LogAiUsageInput {
  /** A server-side Supabase client (RLS-scoped to the current session). */
  supabase: SupabaseClient;
  userId: string | null;
  feature: AiFeature;
  targetId?: string | null;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  imageCount?: number;
  status: "success" | "failed";
  errorMessage?: string | null;
  latencyMs?: number | null;
}

/**
 * Insert one ai_usage_logs row. Best-effort:
 *   - computes estimated_cost_usd from tokens (null when usage is missing)
 *   - swallows ALL errors so logging can never break the AI route itself.
 */
export async function logAiUsage(input: LogAiUsageInput): Promise<void> {
  try {
    const inputTokens = Math.max(0, Math.trunc(input.inputTokens ?? 0));
    const outputTokens = Math.max(0, Math.trunc(input.outputTokens ?? 0));
    const imageCount = Math.max(0, Math.trunc(input.imageCount ?? 0));
    const estimated = estimateOpenAICostUsd(input.model, inputTokens, outputTokens);

    await input.supabase.from("ai_usage_logs").insert({
      user_id: input.userId,
      feature: input.feature,
      target_id: input.targetId ?? null,
      model: input.model,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      image_count: imageCount,
      status: input.status,
      // Keep error short and content-free (no prompts / user data).
      error_message: input.errorMessage ? input.errorMessage.slice(0, 200) : null,
      latency_ms: input.latencyMs ?? null,
      estimated_cost_usd: estimated,
    });
  } catch {
    // Never let metering failures affect the user-facing request.
  }
}
