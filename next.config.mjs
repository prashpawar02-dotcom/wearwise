/** @type {import('next').NextConfig} */
const nextConfig = {
  // We render private wardrobe photos as plain <img> with short-lived signed URLs,
  // so the next/image optimizer is intentionally unused (and not exposed).
  reactStrictMode: true,
};
export default nextConfig;
