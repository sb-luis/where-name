import { z } from 'zod'
import type { RoundResult, Difficulty } from './types'
import { DIFFICULTY_VARIANT } from './difficulty'
import { getDistinctId } from '@/lib/analytics/track'

const achievementSchema = z.object({
  slug:        z.string(),
  name:        z.string(),
  description: z.string(),
})

export type Achievement = z.infer<typeof achievementSchema>

// Wire shape returned by POST /practice/games (snake_case), transformed to
// the camelCase shape the frontend consumes.
const savePracticeGameResponseSchema = z.object({
  saved:                z.boolean(),
  current_streak:       z.number().optional(),
  longest_streak:       z.number().optional(),
  is_first_game_today:  z.boolean().optional(),
  new_achievements:     z.array(achievementSchema).optional(),
}).transform(data => ({
  saved:             data.saved,
  currentStreak:     data.current_streak,
  longestStreak:     data.longest_streak,
  isFirstGameToday:  data.is_first_game_today,
  newAchievements:   data.new_achievements,
}))

export type SavePracticeGameResult = z.infer<typeof savePracticeGameResponseSchema>

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
  return savePracticeGameResponseSchema.parse(await res.json())
}
