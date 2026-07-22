import { z } from 'zod'
import { CONTINENTS, type Continent } from '@/lib/game/countries'
import type { Difficulty } from '@/lib/game/types'

const continentSchema = z.enum(CONTINENTS)
const difficultySchema = z.enum(['easy', 'medium', 'hard'] as const satisfies readonly Difficulty[])

export const achievementSchema = z.object({
  slug:          z.string(),
  name:          z.string(),
  description:   z.string(),
  continent:     continentSchema.optional(),
  difficulty:    difficultySchema,
  new_countries: z.number(),
  unlocked_at:   z.string().optional(),
})

export type Achievement = z.infer<typeof achievementSchema>

export type UnlockLevels = Record<Continent, Difficulty>

export const achievementsResponseSchema = z.object({
  manifest_version: z.string(),
  achievements:      z.array(achievementSchema),
  unlocks:           z.record(continentSchema, difficultySchema),
})

export type AchievementsResponse = z.infer<typeof achievementsResponseSchema>
