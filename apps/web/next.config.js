/** @type {import('next').NextConfig} */
const api = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.API_PROXY_TARGET ||
  ""
).replace(/\/+$/, "");

module.exports = {
  reactStrictMode: true,
  async rewrites() {
    if (!api) return [];
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/health", destination: `${api}/health` },
    ];
  },
};
