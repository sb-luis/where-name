import posthog from 'posthog-js'
import { track } from '@/lib/analytics/track'

const key     = process.env.NEXT_PUBLIC_POSTHOG_KEY
const enabled = process.env.NEXT_PUBLIC_POSTHOG_ENABLED === 'true'

if (enabled && key) {
  posthog.init(key, {
    api_host: '/ingest',
    autocapture: false,
    capture_pageview: false, // we do it ourselves
    capture_pageleave: true,
  })
  // Attaches to every event posthog-js fires from here on
  // including $identify, $pageleave, etc. that don't go through track().
  posthog.register({ environment: process.env.NEXT_PUBLIC_APP_ENV ?? 'local' })
}

export function onRouterTransitionStart(url: string) {
  track('$pageview', { $current_url: url })
}
