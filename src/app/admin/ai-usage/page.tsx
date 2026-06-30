import { requireAdmin } from "@/lib/auth";
import { AppHeader } from "@/components/nav/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { USD_TO_INR } from "@/lib/ai-costs";

export const dynamic = "force-dynamic";

// Internal metering rows. Admin-readable only (RLS enforces this).
interface UsageRow {
  feature: string;
  status: string;
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  image_count: number | null;
  latency_ms: number | null;
  estimated_cost_usd: number | null;
  target_id: string | null;
  user_id: string | null;
  created_at: string;
}

const FEATURE_LABEL: Record<string, string> = {
  wardrobe_autotag: "Wardrobe auto-tag",
  outfit_draft_generation: "Outfit draft generation",
};

function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}
function inr(nUsd: number): string {
  return `₹${(nUsd * USD_TO_INR).toFixed(2)}`;
}

export default async function AiUsagePage() {
  const { supabase } = await requireAdmin();

  // Pull rows for aggregation (beta scale). Cap defensively.
  const { data, error } = await supabase
    .from("ai_usage_logs")
    .select(
      "feature,status,model,input_tokens,output_tokens,image_count,latency_ms,estimated_cost_usd,target_id,user_id,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  const rows = (data ?? []) as UsageRow[];

  // ---- Aggregates ----
  const totalCalls = rows.length;
  const successCalls = rows.filter((r) => r.status === "success").length;
  const failedCalls = totalCalls - successCalls;

  const byFeature = new Map<string, { calls: number; cost: number; costedCalls: number }>();
  let totalCostUsd = 0;
  for (const r of rows) {
    const f = byFeature.get(r.feature) ?? { calls: 0, cost: 0, costedCalls: 0 };
    f.calls += 1;
    if (typeof r.estimated_cost_usd === "number") {
      f.cost += r.estimated_cost_usd;
      f.costedCalls += 1;
      totalCostUsd += r.estimated_cost_usd;
    }
    byFeature.set(r.feature, f);
  }

  const autotag = byFeature.get("wardrobe_autotag");
  const drafts = byFeature.get("outfit_draft_generation");
  const avgAutotag = autotag && autotag.costedCalls > 0 ? autotag.cost / autotag.costedCalls : null;
  const avgDraft = drafts && drafts.costedCalls > 0 ? drafts.cost / drafts.costedCalls : null;

  const recent = rows.slice(0, 50);

  return (
    <main className="min-h-dvh pb-12">
      <AppHeader title="AI usage" back="/admin" />
      <div className="px-6 pt-6 animate-fade-in space-y-6">
        <div>
          <h1 className="font-serif text-2xl font-semibold">AI usage &amp; cost</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal metering. Token counts &amp; estimated cost only — no images, prompts, or notes.
            INR at a fixed ₹{USD_TO_INR}/$ (update in <code>src/lib/ai-costs.ts</code>).
          </p>
        </div>

        {error && (
          <Card>
            <CardContent className="py-4 text-sm text-red-600">
              Could not load logs: {error.message}. Has migration 0005 been run?
            </CardContent>
          </Card>
        )}

        {/* ---- Summary tiles ---- */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Total AI calls" value={String(totalCalls)} />
          <Stat label="Successful" value={String(successCalls)} />
          <Stat label="Failed" value={String(failedCalls)} />
          <Stat label="Est. cost (USD)" value={usd(totalCostUsd)} />
          <Stat label="Est. cost (INR)" value={inr(totalCostUsd)} />
          <Stat
            label="Failure rate"
            value={totalCalls ? `${((failedCalls / totalCalls) * 100).toFixed(1)}%` : "—"}
          />
        </div>

        {/* ---- By feature ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Calls by feature</CardTitle>
          </CardHeader>
          <CardContent>
            <Table
              head={["Feature", "Calls", "Est. cost (USD)", "Est. cost (INR)", "Avg / call"]}
              rows={Array.from(byFeature.entries()).map(([feature, v]) => [
                FEATURE_LABEL[feature] ?? feature,
                String(v.calls),
                usd(v.cost),
                inr(v.cost),
                v.costedCalls > 0 ? usd(v.cost / v.costedCalls) : "—",
              ])}
              empty="No AI calls logged yet."
            />
          </CardContent>
        </Card>

        {/* ---- Per-call averages ---- */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Stat
            label="Avg cost / auto-tag call"
            value={avgAutotag != null ? `${usd(avgAutotag)}  (${inr(avgAutotag)})` : "—"}
          />
          <Stat
            label="Avg cost / outfit-draft call"
            value={avgDraft != null ? `${usd(avgDraft)}  (${inr(avgDraft)})` : "—"}
          />
        </div>

        {/* ---- Recent 50 ---- */}
        <Card>
          <CardHeader>
            <CardTitle>Recent 50 AI calls</CardTitle>
          </CardHeader>
          <CardContent>
            <Table
              head={["When", "Feature", "Status", "In", "Out", "Img", "ms", "Cost (USD)"]}
              rows={recent.map((r) => [
                new Date(r.created_at).toLocaleString("en-IN"),
                FEATURE_LABEL[r.feature] ?? r.feature,
                r.status,
                String(r.input_tokens ?? 0),
                String(r.output_tokens ?? 0),
                String(r.image_count ?? 0),
                r.latency_ms != null ? String(r.latency_ms) : "—",
                r.estimated_cost_usd != null ? usd(r.estimated_cost_usd) : "—",
              ])}
              empty="No AI calls logged yet."
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function Table({
  head,
  rows,
  empty,
}: {
  head: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="py-2 pr-4 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              {r.map((c, j) => (
                <td key={j} className="py-2 pr-4 tabular-nums whitespace-nowrap">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
