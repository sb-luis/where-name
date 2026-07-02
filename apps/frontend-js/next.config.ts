import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  // dev-only: in prod, Caddy intercepts /geo/* and /api/* 
  async rewrites() {
    return [
      {
        // strip /geo/natural_earth prefix before forwarding 
        source: '/geo/natural_earth/:path*',
        destination: `${process.env.NATURAL_EARTH_CDN}/:path*`,
      },
      {
        // strip /api prefix before forwarding 
        source: '/api/:path*',
        destination: `http://localhost:4000/:path*`,
      },
    ];
  },
};

export default nextConfig;
