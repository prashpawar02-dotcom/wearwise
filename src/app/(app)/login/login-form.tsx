"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Mode = "magic" | "password";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [mode, setMode] = useState<Mode>("magic");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const supabase = createClient();
  const siteUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.NEXT_PUBLIC_SITE_URL ?? "";

  // Password login is a DEV-ONLY fallback. It is hidden in production unless
  // NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true". Closed beta uses magic links only.
  const passwordLoginEnabled = process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === "true";

  // One-click DEV bypass. Uses real Supabase auth (so RLS/privacy are unchanged):
  // it signs into a throwaway local account, creating it on first use. Only
  // available when password login is enabled AND this is not a production build.
  const devLoginEnabled = passwordLoginEnabled && process.env.NODE_ENV !== "production";
  const DEV_EMAIL = "dev@wearwise.test";
  const DEV_PASSWORD = "wearwise-dev-123456";

  async function devQuickLogin() {
    setStatus("loading");
    setMessage("");
    const res = await supabase.auth.signInWithPassword({ email: DEV_EMAIL, password: DEV_PASSWORD });
    if (res.error) {
      // Account doesn't exist yet (or wrong creds) — create it, then continue.
      const signUp = await supabase.auth.signUp({ email: DEV_EMAIL, password: DEV_PASSWORD });
      if (signUp.error) { setStatus("error"); setMessage(signUp.error.message); return; }
      if (!signUp.data.session) {
        setStatus("error");
        setMessage(
          "Dev account created, but email confirmation is ON. In Supabase: Auth → Providers → Email → turn off “Confirm email”, then click Dev quick login again."
        );
        return;
      }
    }
    router.push(next);
    router.refresh();
  }

  // ---- Magic link ----
  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) { setStatus("error"); setMessage(error.message); }
    else setStatus("sent");
  }

  // ---- Password sign in ----
  async function signIn() {
    setStatus("loading"); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setStatus("error"); setMessage(error.message); return; }
    router.push(next); router.refresh();
  }

  // ---- Password create account (works instantly if email confirmation is OFF) ----
  async function createAccount() {
    setStatus("loading"); setMessage("");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) { setStatus("error"); setMessage(error.message); return; }
    if (data.session) { router.push(next); router.refresh(); }
    else {
      setStatus("error");
      setMessage("Account created, but email confirmation is on. Turn it off in Supabase (Auth → Sign In / Providers → Email → Confirm email) for instant dev login, then Sign in.");
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-xl border border-sage/40 bg-sage/10 p-5 text-center">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-sm text-muted-foreground">
          We sent a sign-in link to <span className="font-medium text-foreground">{email}</span>.
        </p>
        <button onClick={() => setStatus("idle")} className="mt-3 text-sm text-plum underline-offset-4 hover:underline">
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {devLoginEnabled && (
        <div className="space-y-2 rounded-ww-md border border-champagne/30 bg-champagne/[0.1] p-3">
          <Button onClick={devQuickLogin} variant="plum" size="full" disabled={status === "loading"}>
            {status === "loading" ? "Signing in…" : "Dev quick login (skip email)"}
          </Button>
          <p className="text-center text-[11px] text-graphite">
            Dev only · signs into a throwaway account ({DEV_EMAIL})
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">Email address</Label>
        <Input id="email" type="email" autoComplete="email" placeholder="you@email.com"
          value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>

      {mode === "password" && (
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" type="password" autoComplete="current-password" placeholder="At least 6 characters"
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
      )}

      {status === "error" && <p className="text-sm text-destructive">{message}</p>}

      {mode === "magic" ? (
        <>
          <Button onClick={sendMagicLink} size="full" disabled={status === "loading" || !email}>
            {status === "loading" ? "Sending link…" : "Send me a sign-in link"}
          </Button>
          {passwordLoginEnabled && (
            <button onClick={() => { setMode("password"); setStatus("idle"); }}
              className="block w-full text-center text-sm text-muted-foreground hover:text-foreground">
              Email taking too long? Use a password instead
            </button>
          )}
        </>
      ) : (
        <>
          <Button onClick={signIn} size="full" disabled={status === "loading" || !email || !password}>
            {status === "loading" ? "Signing in…" : "Sign in"}
          </Button>
          <Button onClick={createAccount} variant="outline" size="full" disabled={status === "loading" || !email || !password}>
            Create account
          </Button>
          <button onClick={() => { setMode("magic"); setStatus("idle"); }}
            className="block w-full text-center text-sm text-muted-foreground hover:text-foreground">
            ← Back to email link
          </button>
        </>
      )}
    </div>
  );
}
