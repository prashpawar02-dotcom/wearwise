import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY Supabase admin client (service role).
 *
 * Uses SUPABASE_SERVICE_ROLE_KEY, which BYPASSES Row Level Security. It must
 * NEVER reach the browser:
 *   - Never import this file into a Client Component ("use client").
 *   - Never expose the key as NEXT_PUBLIC_*.
 *   - Only used by server routes (scheduled cron + the authenticated manual
 *     prepare route) to write daily_recommendations on the server's behalf.
 *
 * Normal client/server auth still uses the anon key + user session; this client
 * is exclusively for server-controlled preparation.
 *
 * Throws a clear error if the required env vars are missing, so a misconfigured
 * deployment fails safely (the route returns a 500) instead of silently doing
 * the wrong thing.
 */
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client is not configured: set SUPABASE_SERVICE_ROLE_KEY (server-only) and NEXT_PUBLIC_SUPABASE_URL."
    );
  }

  if (!cached) {
    cached = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}
