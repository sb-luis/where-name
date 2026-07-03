import type { NextConfig } from 'next';

const posthogEnabled = process.env.NEXT_PUBLIC_POSTHOG_ENABLED === 'true';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    const rules = [
      {
        // dev-only: in prod, Caddy intercepts /api/* — strip /api prefix before forwarding
        source: '/api/:path*',
        destination: `http://localhost:4000/:path*`,
      },
    ];

    if (posthogEnabled) {
      rules.push(
        {
          source: '/ingest/static/:path*',
          destination: 'https://eu-assets.i.posthog.com/static/:path*',
        },
        {
          source: '/ingest/:path*',
          destination: 'https://eu.i.posthog.com/:path*',
        },
      );
    }

    return rules;
  },
  skipTrailingSlashRedirect: true,
};

export default nextConfig;
