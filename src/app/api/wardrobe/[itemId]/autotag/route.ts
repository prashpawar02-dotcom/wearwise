import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanTags, AUTOTAG_INSTRUCTIONS, type RawTags } from "@/lib/autotag";
import { logAiUsage } from "@/lib/ai-costs";

export const runtime = "nodejs";
export const maxDuration = 30;

const AUTOTAG_MODEL = "gpt-4o-mini";

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
  webp: "image/webp", gif: "image/gif", heic: "image/heic",
};

export async function POST(_req: Request, { params }: { params: { itemId: string } }) {
  const supabase = createClient();

  // Auth — must be the signed-in owner (RLS also enforces this).
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: item } = await supabase
    .from("wardrobe_items")
    .select("id, image_path, user_id")
    .eq("id", params.itemId)
    .eq("user_id", user.id)
    .single();
  if (!item) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const startedAt = Date.now(); // for ai_usage_logs latency

  const apiKey = process.env.OPENAI_API_KEY; // server-side ONLY — never exposed to client
  if (!apiKey) {
    await supabase.from("wardrobe_items")
      .update({ ai_tag_status: "failed" }).eq("id", item.id);
    return NextResponse.json({ status: "failed", reason: "no_api_key" }, { status: 200 });
  }

  try {
    // Mark analyzing.
    await supabase.from("wardrobe_items")
      .update({ ai_tag_status: "analyzing" }).eq("id", item.id);

    // Read the private image server-side and inline it as base64 (never made public).
    const { data: blob, error: dlErr } = await supabase.storage
      .from("wardrobe").download(item.image_path);
    if (dlErr || !blob) throw new Error("download_failed");

    const ext = (item.image_path.split(".").pop() || "jpg").toLowerCase();
    const mime = MIME[ext] || "image/jpeg";
    const b64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
    const dataUrl = `data:${mime};base64,${b64}`;

    // Call OpenAI vision (gpt-4o-mini).
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: AUTOTAG_MODEL,
        temperature: 0.2,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Return only valid JSON matching the requested schema." },
          {
            role: "user",
            content: [
              { type: "text", text: AUTOTAG_INSTRUCTIONS },
              { type: "image_url", image_url: { url: dataUrl, detail: "low" } },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) throw new Error(`openai_${resp.status}`);
    const json = await resp.json();
    const usage = (json?.usage ?? {}) as { prompt_tokens?: number; completion_tokens?: number };
    const content: string = json?.choices?.[0]?.message?.content ?? "{}";

    let raw: RawTags;
    try { raw = JSON.parse(content); } catch { throw new Error("bad_json"); }

    const clean = cleanTags(raw);

    const { error: upErr } = await supabase.from("wardrobe_items").update({
      category: clean.category,
      sub_category: clean.sub_category,
      color: clean.color,
      secondary_colors: clean.secondary_colors,
      pattern: clean.pattern,
      style: clean.style,
      occasion_tags: clean.occasion_tags,
      ethnic_western_fusion: clean.ethnic_western_fusion,
      user_facing_name: clean.user_facing_name,
      ai_confidence: clean.ai_confidence,
      ai_tag_status: clean.needs_review ? "needs_review" : "tagged",
      auto_tagged_at: new Date().toISOString(),
    }).eq("id", item.id);
    if (upErr) throw new Error("update_failed");

    // Meter the successful call (best-effort; never blocks the response).
    await logAiUsage({
      supabase,
      userId: user.id,
      feature: "wardrobe_autotag",
      targetId: item.id,
      model: AUTOTAG_MODEL,
      inputTokens: usage.prompt_tokens ?? 0,
      outputTokens: usage.completion_tokens ?? 0,
      imageCount: 1,
      status: "success",
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json({
      status: clean.needs_review ? "needs_review" : "tagged",
      confidence: clean.ai_confidence,
    });
  } catch (err) {
    // Any failure: fall back to manual tagging (the Edit Details screen).
    await supabase.from("wardrobe_items")
      .update({ ai_tag_status: "failed" }).eq("id", item.id);

    // Meter the failed call (tokens unknown => cost stored as null).
    await logAiUsage({
      supabase,
      userId: user.id,
      feature: "wardrobe_autotag",
      targetId: item.id,
      model: AUTOTAG_MODEL,
      imageCount: 1,
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "unknown",
      latencyMs: Date.now() - startedAt,
    });

    return NextResponse.json(
      { status: "failed", reason: err instanceof Error ? err.message : "unknown" },
      { status: 200 }
    );
  }
}
