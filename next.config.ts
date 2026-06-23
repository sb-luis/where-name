import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  ...(process.env.NODE_ENV === 'production' && { basePath: '/games/where-is-world' }),
  async rewrites() {
    const geoUrl = process.env.BACKEND_GEO_URL || 'http://localhost:4100';
    return [
      {
        source: '/geo/:path*',
        destination: `${geoUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
