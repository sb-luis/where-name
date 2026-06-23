import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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
