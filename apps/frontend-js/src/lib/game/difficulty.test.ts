import { describe, it, expect } from 'vitest'
import { poolFor, totalUnlocked, DIFFICULTY_VARIANT, DIFFICULTY_LOD_LEVEL, type GeoManifest } from './difficulty'
import { CONTINENTS, type Continent } from './countries'
import manifest from '@/lib/geo/geo-manifest.json'
import type { Difficulty } from './types'

const typedManifest = manifest as GeoManifest

describe('poolFor', () => {
  it('returns exactly the easy-tier names for a single continent at easy difficulty', () => {
    const pool = poolFor('easy', ['Africa'])
    expect(pool.sort()).toEqual([...typedManifest.difficulties.easy.Africa].sort())
  })

  it('accumulates medium as easy + medium deltas, without duplicates', () => {
    const pool = poolFor('medium', ['Africa'])
    const expected = new Set([
      ...typedManifest.difficulties.easy.Africa,
      ...typedManifest.difficulties.medium.Africa,
    ])
    expect(new Set(pool)).toEqual(expected)
    expect(pool.length).toBe(expected.size)
  })

  it('accumulates hard as the union of all three tiers', () => {
    const pool = poolFor('hard', ['Asia'])
    const expected = new Set([
      ...typedManifest.difficulties.easy.Asia,
      ...typedManifest.difficulties.medium.Asia,
      ...typedManifest.difficulties.hard.Asia,
    ])
    expect(new Set(pool)).toEqual(expected)
  })

  it('concatenates pools across multiple continents', () => {
    const combined = poolFor('easy', ['Africa', 'Asia'])
    const africa = poolFor('easy', ['Africa'])
    const asia = poolFor('easy', ['Asia'])
    expect(combined.length).toBe(africa.length + asia.length)
  })

  it('returns an empty pool for an empty continent list', () => {
    expect(poolFor('hard', [])).toEqual([])
  })
})

describe('totalUnlocked', () => {
  it('sums per-continent cumulative counts at each continent\'s unlocked difficulty', () => {
    const unlocks = { Africa: 'medium' } as Record<Continent, Difficulty>
    const otherContinents = CONTINENTS.filter(c => c !== 'Africa')
    const expected = poolFor('medium', ['Africa']).length + poolFor('easy', otherContinents).length
    expect(totalUnlocked(unlocks)).toBe(expected)
  })

  it('defaults missing continents to easy', () => {
    const unlocks = {} as Record<Continent, Difficulty>
    const expected = CONTINENTS.reduce((sum, c) => sum + poolFor('easy', [c]).length, 0)
    expect(totalUnlocked(unlocks)).toBe(expected)
  })

  it('matches the full easy pool when every continent is unlocked at easy', () => {
    const unlocks = Object.fromEntries(CONTINENTS.map(c => [c, 'easy'])) as Record<Continent, Difficulty>
    expect(totalUnlocked(unlocks)).toBe(poolFor('easy', CONTINENTS).length)
  })
})

describe('DIFFICULTY_VARIANT / DIFFICULTY_LOD_LEVEL', () => {
  it('map every difficulty to a variant and LOD level', () => {
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard']
    for (const d of difficulties) {
      expect(DIFFICULTY_VARIANT[d]).toBeTruthy()
      expect(DIFFICULTY_LOD_LEVEL[d]).toBeGreaterThanOrEqual(0)
    }
  })
})
