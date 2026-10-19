/** @type {import('next').NextConfig} */
const api = (process.env.NEXT_PUBLIC_API_URL || process.env.API_PROXY_TARGET || "").replace(/\/+$/, "");

module.exports = {
  reactStrictMode: true,
  async rewrites() {
    // Proxy /api/* and /health to the API service so the web domain does not 404 on API paths
    if (!api) return [];
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/health", destination: `${api}/health` },
    ];
  },
};
