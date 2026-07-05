"use client";

/**
 * Root error boundary. This replaces the root layout when it triggers, so it
 * must render its own <html>/<body> and cannot rely on the app's stylesheet —
 * hence inline, on-brand styling (ivory background, charcoal text).
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          margin: 0,
          background: "#F5F1EA",
          color: "#1C1A17",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, fontSize: "0.9rem", color: "#57534A" }}>
            WearWise ran into an unexpected problem. Please try again.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 20,
              height: 48,
              width: "100%",
              borderRadius: 999,
              border: "none",
              background: "#1C1A17",
              color: "#FBF8F3",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
