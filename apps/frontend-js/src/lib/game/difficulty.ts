import manifest from '@/lib/geo/geo-manifest.json'
import type { Continent } from './countries'
import type { Difficulty } from './types'

export const DIFFICULTY_VARIANT: Record<Difficulty, string> = {
  easy:   'ne_110m_admin_0_countries',
  medium: 'ne_50m_admin_0_countries',
  hard:   'ne_10m_admin_0_countries',
}

export const DIFFICULTY_LOD_LEVEL: Record<Difficulty, 0 | 1 | 2> = {
  easy:   0,
  medium: 1,
  hard:   2,
}

interface GeoManifest {
  version: string
  order: Difficulty[]
  continents: string[]
  difficulties: Record<Difficulty, Record<string, string[]>> // delta: names first appearing at this difficulty
}

const typedManifest = manifest as GeoManifest

// cumulative[difficulty][continent] = union of deltas up to and including that difficulty
const cumulative: Record<Difficulty, Record<string, string[]>> = (() => {
  const result = {} as Record<Difficulty, Record<string, string[]>>
  const running: Record<string, Set<string>> = {}
  for (const continent of typedManifest.continents) running[continent] = new Set()
  for (const difficulty of typedManifest.order) {
    const byContinent = typedManifest.difficulties[difficulty]
    for (const continent of typedManifest.continents) {
      const set = running[continent] ?? (running[continent] = new Set())
      for (const name of byContinent[continent] ?? []) set.add(name)
    }
    const snapshot: Record<string, string[]> = {}
    for (const continent of typedManifest.continents) snapshot[continent] = [...running[continent]]
    result[difficulty] = snapshot
  }
  return result
})()

export function poolFor(difficulty: Difficulty, continents: readonly Continent[]): string[] {
  const byContinent = cumulative[difficulty]
  const names: string[] = []
  for (const continent of continents) {
    for (const name of byContinent[continent] ?? []) names.push(name)
  }
  return names
}

// sum of cumulative country counts per continent at each continent's unlocked difficulty
export function totalUnlocked(unlocks: Record<Continent, Difficulty>): number {
  let total = 0
  for (const continent of typedManifest.continents as Continent[]) {
    const difficulty = unlocks[continent] ?? 'easy'
    total += (cumulative[difficulty][continent] ?? []).length
  }
  return total
}
