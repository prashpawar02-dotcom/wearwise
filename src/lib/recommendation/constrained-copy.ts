// =====================================================================
// WearWise — honest constrained-state copy (Phase 5 hotfix, Case B)
//
// PURE. Builds the Today constrained message from the REAL failure:
//   1. WHAT changed — the previously-picked item(s) that became unusable
//      (garment names are private to the owner, so the UI may name them;
//      analytics must never carry them).
//   2. WHY no replacement exists — the engine's own persisted fail reason.
// Never invents advice: footwear guidance appears ONLY when footwear is the
// genuine blocker, weather wording ONLY for a weather/hard-rule rejection.
// =====================================================================

/** Structured availability reasons (mirrors outfit-validity's InvalidReason). */
export type BlockedReason = "in_wash" | "unavailable" | "archived" | "missing" | "hard_filter_failed";

export interface ConstrainedInput {
  /** Persisted engine fail reason for why no new outfit could be built. */
  failReason?: string | null;
  /** Names of previously-picked items that became unusable (owner-private). */
  blockedNames?: string[];
  /** Why those items dropped out. */
  blockedReason?: BlockedReason | null;
  /** Engine-supplied message, used only as a last-resort tail. */
  message?: string | null;
}

function leadFor(names: string[] | undefined, reason: BlockedReason | null | undefined): string {
  if (!names || names.length === 0) return "";
  const state =
    reason === "in_wash" ? "is in the wash"
      : reason === "archived" ? "is archived"
        : reason === "missing" ? "is no longer in your wardrobe"
          : "isn't available right now";
  if (names.length === 1) return `That ${names[0]} ${state}. `;
  const plural =
    reason === "in_wash" ? "are in the wash"
      : reason === "archived" ? "are archived"
        : reason === "missing" ? "are no longer in your wardrobe"
          : "aren't available right now";
  return `${names.length} pieces from today's outfit ${plural}. `;
}

/** Tail derived strictly from the engine's real reason — no unrelated advice. */
function tailFor(failReason: string | null | undefined, message: string | null | undefined): string {
  switch (failReason) {
    case "no_footwear_in_wardrobe":
      return "I couldn't complete another outfit because there are no shoes in your wardrobe yet.";
    case "no_available_footwear":
    case "no_footwear_available":
    case "footwear_in_wash":
    case "footwear_unavailable":
    case "footwear_archived":
      return "I couldn't find clean shoes to complete another outfit today.";
    case "no_valid_outfit":
      return "I couldn't find another complete clean outfit for today's weather and occasion.";
    case "outfit_roles_incomplete":
      return "What's clean right now doesn't cover a full outfit.";
    case "no_wearable_items":
    case "too_few_wearable_items":
      return "There aren't enough clean pieces to build a full outfit right now.";
    default:
      return message?.trim()
        ? message.trim()
        : "I couldn't find another complete clean outfit from what's clean right now.";
  }
}

/** One honest sentence pair: what changed + why no replacement exists. */
export function constrainedCopy(input: ConstrainedInput): string {
  return `${leadFor(input.blockedNames, input.blockedReason ?? null)}${tailFor(input.failReason ?? null, input.message ?? null)}`;
}

/** True when the honest answer is "your wardrobe is too thin" (routes to setup). */
export function isThinWardrobe(failReason: string | null | undefined, itemCount: number): boolean {
  return failReason === "no_wardrobe" || failReason === "too_few_wearable_items" || itemCount < 10;
}
