/** @type {import('next').NextConfig} */

// Security headers (Module G / plan §8.9). CSP allows exactly what the app
// uses: self, Supabase (API + storage), Razorpay checkout, Firebase/gstatic
// (push), PostHog, and OpenWeather — nothing else.
//
// DEVELOPMENT-ONLY (locked): when NODE_ENV !== "production" we additionally
// allow the LOCAL Supabase stack (Kong on :54321) for the auth/health/realtime
// API and local Storage images. These origins are NEVER added to the production
// CSP. No other directive is touched.
const LOCAL_SUPABASE_CONNECT = [
  "http://127.0.0.1:54321",
  "http://localhost:54321",
  "ws://127.0.0.1:54321",
  "ws://localhost:54321",
];
const LOCAL_SUPABASE_IMG = [
  "http://127.0.0.1:54321",
  "http://localhost:54321",
];

/** Build the security headers for the given environment. Production output is
 *  byte-for-byte identical to before; dev appends only the local Supabase
 *  origins to connect-src (HTTP + WS) and img-src (HTTP). */
function buildSecurityHeaders(isDev) {
  const connectSrc = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://api.razorpay.com",
    "https://fcm.googleapis.com",
    "https://firebaseinstallations.googleapis.com",
    "https://fcmregistrations.googleapis.com",
    "https://us.i.posthog.com",
    "https://app.posthog.com",
    "https://api.openweathermap.org",
    ...(isDev ? LOCAL_SUPABASE_CONNECT : []),
  ];
  const imgSrc = [
    "'self'",
    "data:",
    "blob:",
    "https://*.supabase.co",
    ...(isDev ? LOCAL_SUPABASE_IMG : []),
  ];

  return [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com https://www.gstatic.com https://us-assets.i.posthog.com https://app.posthog.com",
        "style-src 'self' 'unsafe-inline'",
        `img-src ${imgSrc.join(" ")}`,
        "font-src 'self' data:",
        `connect-src ${connectSrc.join(" ")}`,
        "frame-src https://api.razorpay.com https://checkout.razorpay.com",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; "),
    },
  ];
}

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    const isDev = process.env.NODE_ENV !== "production";
    return [{ source: "/(.*)", headers: buildSecurityHeaders(isDev) }];
  },
};
export default nextConfig;
