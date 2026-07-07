// =====================================================================
// WearWise — notification senders (Module D). SERVER-ONLY.
// Channel priority: FCM web push → Resend email fallback. WhatsApp is
// intentionally NOT implemented until opt-in + template approval exist
// (compliance first). Every send is logged to app_events. All senders
// are no-op-safe when env keys are missing.
// =====================================================================
import { logAppEvent } from "@/lib/events";

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

/**
 * Send a web push via FCM legacy HTTP API (FCM_SERVER_KEY).
 * Returns true on accepted delivery, false otherwise (caller may fall back).
 */
export async function sendPush(fcmToken: string, payload: PushPayload): Promise<boolean> {
  const key = process.env.FCM_SERVER_KEY;
  if (!key) return false;
  try {
    const resp = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `key=${key}` },
      body: JSON.stringify({
        to: fcmToken,
        notification: { title: payload.title, body: payload.body },
        data: { url: payload.url ?? "/dashboard" },
        webpush: { fcm_options: { link: payload.url ?? "/dashboard" } },
      }),
    });
    if (!resp.ok) return false;
    const json = (await resp.json()) as { success?: number };
    return (json.success ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Send an email via Resend (RESEND_API_KEY + RESEND_FROM). */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM ?? "WearWise <hello@wearwise.app>";
  if (!key) return false;
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ from, to, subject, html }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/**
 * Notify one user: push first, email fallback. Logs the outcome.
 * `kind` is the discipline bucket ('morning' | 'streak_risk' | 'weekly_recap').
 */
export async function notifyUser(opts: {
  userId: string;
  email: string | null;
  fcmTokens: string[];
  kind: string;
  title: string;
  body: string;
  url?: string;
}): Promise<"push" | "email" | "none"> {
  for (const token of opts.fcmTokens) {
    if (await sendPush(token, { title: opts.title, body: opts.body, url: opts.url })) {
      await logAppEvent("notification_sent", opts.userId, { kind: opts.kind, channel: "push" });
      return "push";
    }
  }
  if (opts.email && (await sendEmail(opts.email, opts.title, `<p>${opts.body}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}${opts.url ?? "/dashboard"}">Open WearWise</a></p>`))) {
    await logAppEvent("notification_sent", opts.userId, { kind: opts.kind, channel: "email" });
    return "email";
  }
  await logAppEvent("notification_skipped", opts.userId, { kind: opts.kind });
  return "none";
}
