import { createClient } from "@/lib/supabase/server";

/** Create short-lived signed URLs for private wardrobe photos. */
export async function signWardrobePaths(paths: string[], expiresIn = 60 * 60) {
  if (paths.length === 0) return {};
  const supabase = createClient();
  const { data } = await supabase.storage.from("wardrobe").createSignedUrls(paths, expiresIn);
  const map: Record<string, string> = {};
  data?.forEach((d) => {
    if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
  });
  return map;
}
