import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const apiProxyTarget = process.env.API_PROXY_TARGET ?? "https://petrol-partner.onrender.com";
    return [
      {
        source: "/v1/:path*",
        destination: `${apiProxyTarget}/v1/:path*`,
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn-icons-png.flaticon.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;
