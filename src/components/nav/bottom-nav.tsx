// =====================================================================
// WearWise — Bottom tab bar (public API preserved for Phase 4A)
//
// This file used to own the nav markup directly. As of Phase 4A the
// presentation moved to `components/shell/TabBar.tsx` (part of the shared
// One-Screen shell foundation) with the relabeled IA from
// `lib/shell/tabs.ts` (Today · Wardrobe · Style Me · Plan · You — routes
// UNCHANGED, see handoff §1). This file now just re-exports it so the 7
// pages that `import { BottomNav } from "@/components/nav/bottom-nav"`
// keep working with zero changes.
// =====================================================================
export { TabBar as BottomNav } from "@/components/shell/TabBar";
