import type { RoundResult, Difficulty } from './types'
import { DIFFICULTY_VARIANT } from './difficulty'
import { getDistinctId } from '@/lib/analytics/track'

export interface Achievement {
  slug: string
  name: string
  description: string
}

export interface SavePracticeGameResult {
  saved: boolean
  currentStreak?: number
  longestStreak?: number
  isFirstGameToday?: boolean
  newAchievements?: Achievement[]
}

// Wire shape returned by POST /practice/games, before mapping to camelCase.
interface SavePracticeGameResponse {
  saved: boolean
  current_streak?: number
  longest_streak?: number
  is_first_game_today?: boolean
  new_achievements?: Achievement[]
}

export async function savePracticeGame(
  results: RoundResult[],
  elapsedMs: number,
  completed: boolean,
  difficulty: Difficulty,
  opts: { skipAnalytics?: boolean } = {},
): Promise<SavePracticeGameResult> {
  const res = await fetch('/api/practice/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      variant: DIFFICULTY_VARIANT[difficulty],
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
  const data = await res.json() as SavePracticeGameResponse
  return {
    saved:             data.saved,
    currentStreak:     data.current_streak,
    longestStreak:     data.longest_streak,
    isFirstGameToday:  data.is_first_game_today,
    newAchievements:   data.new_achievements,
  }
}
