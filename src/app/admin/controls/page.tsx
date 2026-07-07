import { requireAdmin } from "@/lib/auth";
import { getFlags } from "@/lib/flags";
import { AppHeader } from "@/components/nav/app-header";
import { ControlsBoard } from "./controls-board";

export const dynamic = "force-dynamic";

/**
 * Admin Feature Control Panel (Module A / plan §5.11).
 * Toggle switches per feature: Auto (green) ↔ Human-approve (amber) ↔ Off
 * (grey), plus AI cost guardrails and the eco-mode master switch.
 * Changes apply live — no redeploy.
 */
export default async function AdminControlsPage() {
  await requireAdmin();
  const flags = await getFlags();

  return (
    <main className="min-h-dvh pb-16">
      <AppHeader title="Feature controls" back="/admin" />
      <div className="mx-auto max-w-[560px] px-5 pt-6">
        <p className="text-sm text-muted-foreground">
          Changes apply live (≤30s cache). Green = Auto/On · Amber = Human-approve · Grey = Off.
        </p>
        <ControlsBoard initial={flags} />
      </div>
    </main>
  );
}
