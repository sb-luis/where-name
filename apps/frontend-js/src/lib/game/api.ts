import type { RoundResult } from './types'
import { getDistinctId } from '@/lib/analytics/track'

export async function savePracticeGame(
  results: RoundResult[],
  elapsedMs: number,
  completed: boolean,
  opts: { skipAnalytics?: boolean } = {},
) {
  const res = await fetch('/api/practice/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      variant: 'ne_110m_admin_0_countries',
      completed,
      duration_ms: elapsedMs,
      distinct_id: getDistinctId(),
      skip_analytics: opts.skipAnalytics ?? false,
      rounds: results.map((r, i) => ({
        position:    i,
        feature:     r.country,
        attempt:     1,
        outcome:     r.outcome,
        duration_ms: r.timeMs,
      })),
    }),
  })
  if (!res.ok) throw new Error('Failed to save practice game')
}
