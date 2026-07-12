import type { Continent } from '@/lib/game/countries'
import type { Difficulty } from '@/lib/game/types'

export interface Achievement {
  slug:         string
  name:         string
  description:  string
  continent?:   Continent
  difficulty:   Difficulty
  unlocked_at?: string
}

export type UnlockLevels = Record<Continent, Difficulty>

export interface AchievementsResponse {
  manifest_version: string
  achievements:     Achievement[]
  unlocks:          UnlockLevels
}
