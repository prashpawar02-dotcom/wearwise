"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { track } from "@/lib/analytics";

/**
 * Enable/disable the morning outfit push (Module D).
 * Loads the Firebase compat SDK from the gstatic CDN at click time (no npm
 * dependency), registers the service worker with the public config in the
 * query string, and stores the FCM token via /api/push/register.
 * No-ops gracefully when Firebase env vars aren't configured.
 */

declare global {
  interface Window {
    firebase?: {
      initializeApp: (c: object) => unknown;
      apps?: unknown[];
      messaging: () => {
        getToken: (o: { vapidKey?: string; serviceWorkerRegistration?: ServiceWorkerRegistration }) => Promise<string>;
      };
    };
  }
}

function firebaseConfig(): Record<string, string> | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const senderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (!apiKey || !projectId || !senderId || !appId) return null;
  return {
    apiKey,
    projectId,
    messagingSenderId: senderId,
    appId,
    authDomain: `${projectId}.firebaseapp.com`,
  };
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("script_load_failed"));
    document.head.appendChild(s);
  });
}

export function EnableNotifications({ reminderTime, timezone }: { reminderTime: string; timezone: string }) {
  const [state, setState] = useState<"unknown" | "unsupported" | "off" | "busy" | "on">("unknown");
  const [error, setError] = useState("");

  const config = firebaseConfig();

  useEffect(() => {
    if (!config || typeof Notification === "undefined" || !("serviceWorker" in navigator)) {
      setState("unsupported");
      return;
    }
    setState(Notification.permission === "granted" ? "on" : "off");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function enable() {
    if (!config) return;
    setState("busy");
    setError("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState("off");
        setError("Notifications were blocked — you can enable them in your browser settings.");
        return;
      }
      await loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js");
      await loadScript("https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js");
      const fb = window.firebase;
      if (!fb) throw new Error("no_firebase");
      if (!fb.apps || fb.apps.length === 0) fb.initializeApp(config);

      const swUrl = `/firebase-messaging-sw.js?config=${encodeURIComponent(JSON.stringify(config))}`;
      const registration = await navigator.serviceWorker.register(swUrl);

      const token = await fb.messaging().getToken({
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration,
      });
      if (!token) throw new Error("no_token");

      const resp = await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fcmToken: token, reminderTime, timezone }),
      });
      if (!resp.ok) throw new Error("register_failed");
      track("push_enabled", {});
      setState("on");
    } catch {
      setState("off");
      setError("Couldn't set up notifications right now — try again in a moment.");
    }
  }

  async function disable() {
    setState("busy");
    try {
      await fetch("/api/push/register", { method: "DELETE" });
      track("push_disabled", {});
    } finally {
      setState("off");
    }
  }

  if (state === "unknown") return null;
  if (state === "unsupported") {
    return (
      <p className="text-xs text-muted-foreground">
        Morning reminders arrive by email. Push notifications need the app opened in a supported browser.
      </p>
    );
  }

  return (
    <div>
      <button
        onClick={state === "on" ? disable : enable}
        disabled={state === "busy"}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium"
      >
        {state === "on" ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {state === "busy" ? "Working…" : state === "on" ? "Turn off morning push" : "Get my outfit at " + reminderTime.slice(0, 5)}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
