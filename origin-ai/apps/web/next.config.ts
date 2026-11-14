import type { NextConfig } from "next";

// The browser only ever talks to this origin; /api is proxied to the Origin
// API. Session cookies therefore stay same-origin and no API URL or secret
// is ever shipped in frontend code.
const API_URL = process.env.ORIGIN_API_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
};

export default nextConfig;
