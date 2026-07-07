// =====================================================================
// WearWise — entitlements: the SINGLE server-side gate for every limited
// action (plan §2.3 implemented verbatim). The client only greys out UI;
// every API route that touches a gated capability calls getEntitlements()
// and enforces the result. Never trust the client.
// =====================================================================
import { createAdminClient } from "@/lib/supabase-admin";
import type { Occasion } from "@/lib/types";

export type Plan = "free" | "pro";

export interface Limits {
  /** Max wardrobe items (Infinity for Pro). */
  maxWardrobeItems: number;
  /** Daily Drop swaps + "another option" allowed at all. */
  unlimitedSwaps: boolean;
  /** Occasions the user may request. */
  occasionsAllowed: Occasion[] | "all";
  /** Outfit ideas returned per occasion request. */
  ideasPerRequest: number;
  /** Max saved looks (Infinity for Pro). */
  maxSavedLooks: number;
  weatherAware: boolean;
  planAhead: boolean;
  /** Streak freezes granted per month. */
  streakFreezesPerMonth: number;
  /** Free quarterly Manual Analysis (Pro perk). */
  freeAnalysisPerQuarter: number;
}

export interface Entitlements {
  plan: Plan;
  isTrialActive: boolean;
  /** Effective tier: trial users get the full Pro experience. */
  effectivePro: boolean;
  trialEndsAt: string | null;
  limits: Limits;
}

const FREE_OCCASIONS: Occasion[] = ["casual", "work"];

export const FREE_LIMITS: Limits = {
  maxWardrobeItems: 15,
  unlimitedSwaps: false,
  occasionsAllowed: FREE_OCCASIONS,
  ideasPerRequest: 1,
  maxSavedLooks: 5,
  weatherAware: false,
  planAhead: false,
  streakFreezesPerMonth: 0,
  freeAnalysisPerQuarter: 0,
};

export const PRO_LIMITS: Limits = {
  maxWardrobeItems: Number.POSITIVE_INFINITY,
  unlimitedSwaps: true,
  occasionsAllowed: "all",
  ideasPerRequest: 3,
  maxSavedLooks: Number.POSITIVE_INFINITY,
  weatherAware: true,
  planAhead: true,
  streakFreezesPerMonth: 2,
  freeAnalysisPerQuarter: 1,
};

interface SubRow {
  plan: string;
  status: string;
  trial_ends_at: string | null;
}

/**
 * Resolve a user's plan + limits. Uses the service-role client because
 * subscriptions are readable-own only and this helper also runs inside
 * cron/webhook contexts with no session.
 */
export async function getEntitlements(userId: string): Promise<Entitlements> {
  let sub: SubRow | null = null;
  let legacyPremium = false;
  try {
    const admin = createAdminClient();
    const [{ data: s }, { data: p }] = await Promise.all([
      admin.from("subscriptions").select("plan, status, trial_ends_at").eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("is_premium").eq("id", userId).maybeSingle(),
    ]);
    sub = (s as SubRow | null) ?? null;
    legacyPremium = Boolean(p?.is_premium);
  } catch {
    // Fail CLOSED to free limits — an outage must never grant Pro.
  }

  const isTrialActive =
    sub?.status === "trialing" && !!sub.trial_ends_at && Date.parse(sub.trial_ends_at) > Date.now();
  const isPaidPro = sub?.status === "active" && sub.plan === "pro";
  const effectivePro = isPaidPro || isTrialActive || legacyPremium;

  return {
    plan: isPaidPro || legacyPremium ? "pro" : "free",
    isTrialActive,
    effectivePro,
    trialEndsAt: sub?.trial_ends_at ?? null,
    limits: effectivePro ? PRO_LIMITS : FREE_LIMITS,
  };
}

/** True when the requested occasion is allowed on the user's plan. */
export function occasionAllowed(e: Entitlements, occasion: Occasion): boolean {
  return e.limits.occasionsAllowed === "all" || e.limits.occasionsAllowed.includes(occasion);
}
