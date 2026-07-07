/** @type {import('next').NextConfig} */

// Security headers (Module G / plan §8.9). CSP allows exactly what the app
// uses: self, Supabase (API + storage), Razorpay checkout, Firebase/gstatic
// (push), PostHog, and OpenWeather — nothing else.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js requires inline for its runtime; Razorpay + Firebase + PostHog scripts.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://www.gstatic.com https://us-assets.i.posthog.com https://app.posthog.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.supabase.co",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.razorpay.com https://fcm.googleapis.com https://firebaseinstallations.googleapis.com https://fcmregistrations.googleapis.com https://us.i.posthog.com https://app.posthog.com https://api.openweathermap.org",
      "frame-src https://api.razorpay.com https://checkout.razorpay.com",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  // We render private wardrobe photos as plain <img> with short-lived signed URLs,
  // so the next/image optimizer is intentionally unused (and not exposed).
  reactStrictMode: true,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};
export default nextConfig;
