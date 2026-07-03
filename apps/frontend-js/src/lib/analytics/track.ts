'use client'

import posthog from 'posthog-js'

const enabled = process.env.NEXT_PUBLIC_POSTHOG_ENABLED === 'true'

export function track(event: string, properties?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test') return
  if (!enabled) return
  posthog.capture(event, properties)
}

export function getDistinctId(): string | undefined {
  if (!enabled) return undefined
  return posthog.get_distinct_id()
}

// Merges the current anonymous session into a real user's identity — call
// once, right after login/register succeeds. 
export function identify(userId: number, personProperties?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test') return
  if (!enabled) return
  posthog.identify(`${process.env.NEXT_PUBLIC_APP_ENV ?? 'local'}:${userId}`, personProperties)
}

// Starts a fresh anonymous identity — call on logout, so a different person
// signing in on the same browser next can't be merged into the previous
// user's identity.
export function resetIdentity() {
  if (process.env.NODE_ENV === 'test') return
  if (!enabled) return
  posthog.reset()
}
