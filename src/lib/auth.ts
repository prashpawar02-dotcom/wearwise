import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Returns the signed-in user or redirects to /login. */
export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { user, supabase };
}

/** Returns the signed-in user + their profile, or redirects. */
export async function requireProfile() {
  const { user, supabase } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return { user, supabase, profile: profile as Profile | null };
}

/** Ensures the user is an admin or redirects to the dashboard. */
export async function requireAdmin() {
  const { user, supabase, profile } = await requireProfile();
  if (!profile?.is_admin) redirect("/dashboard");
  return { user, supabase, profile };
}
