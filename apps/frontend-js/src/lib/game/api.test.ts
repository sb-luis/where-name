import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { savePracticeGame } from './api'
import type { RoundResult } from './types'

const results: RoundResult[] = [
  { country: 'Spain', outcome: 'correct', timeMs: 1200 },
  { country: 'France', outcome: 'wrong', timeMs: 3400 },
  { country: 'Italy', outcome: 'skipped', timeMs: 500 },
]

function jsonResponse(body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 500 })
}

function requestBody(fetchMock: ReturnType<typeof vi.mocked<typeof fetch>>, callIndex = 0): unknown {
  const body = fetchMock.mock.calls[callIndex]?.[1]?.body
  if (typeof body !== 'string') throw new Error(`expected a string request body, got ${typeof body}`)
  return JSON.parse(body)
}

describe('savePracticeGame', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the snake_case request shape the backend expects', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse({ saved: true }))

    await savePracticeGame(results, 15000, true, 'medium')

    expect(fetchMock).toHaveBeenCalledWith('/api/practice/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        variant: 'ne_50m_admin_0_countries',
        completed: true,
        duration_ms: 15000,
        distinct_id: undefined,
        skip_analytics: false,
        rounds: [
          { position: 0, feature: 'Spain', attempt: 1, outcome: 'correct', duration_ms: 1200 },
          { position: 1, feature: 'France', attempt: 1, outcome: 'wrong', duration_ms: 3400 },
          { position: 2, feature: 'Italy', attempt: 1, outcome: 'skipped', duration_ms: 500 },
        ],
      }),
    })
  })

  it('defaults skip_analytics to false when opts is omitted', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse({ saved: true }))

    await savePracticeGame(results, 1000, false, 'easy')

    expect(requestBody(fetchMock)).toMatchObject({ skip_analytics: false })
  })

  it('honors an explicit skip_analytics override', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse({ saved: true }))

    await savePracticeGame(results, 1000, false, 'easy', { skipAnalytics: true })

    expect(requestBody(fetchMock)).toMatchObject({ skip_analytics: true })
  })

  it('maps the snake_case response back to camelCase', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse({
      saved: true,
      current_streak: 4,
      longest_streak: 9,
      is_first_game_today: true,
      new_achievements: [{ slug: 'first-win', name: 'First Win', description: 'Win a round' }],
    }))

    const result = await savePracticeGame(results, 1000, true, 'hard')

    expect(result).toEqual({
      saved: true,
      currentStreak: 4,
      longestStreak: 9,
      isFirstGameToday: true,
      newAchievements: [{ slug: 'first-win', name: 'First Win', description: 'Win a round' }],
    })
  })

  it('throws when the response is not ok', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(jsonResponse({}, false))

    await expect(savePracticeGame(results, 1000, true, 'easy')).rejects.toThrow(
      'Failed to save practice game',
    )
  })
})
