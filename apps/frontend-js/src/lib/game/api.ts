import type { RoundResult } from './types'

export async function savePracticeGame(results: RoundResult[], elapsedMs: number, completed: boolean) {
  const res = await fetch('/api/practice/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      variant: 'ne_110m_admin_0_countries',
      completed,
      duration_ms: elapsedMs,
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
