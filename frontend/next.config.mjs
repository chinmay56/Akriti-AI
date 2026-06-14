const backendUrl = process.env.AKRITI_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || "https://akriti-ai-production.up.railway.app";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
