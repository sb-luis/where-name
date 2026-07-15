import { describe, it, expect } from 'vitest'
import { filterByContinents, pickRandom, type CountryEntry } from './countries'

describe('filterByContinents', () => {
  const entries: CountryEntry[] = [
    { name: 'Spain', continent: 'Europe' },
    { name: 'Kenya', continent: 'Africa' },
    { name: 'France', continent: 'Europe' },
    { name: 'Japan', continent: 'Asia' },
  ]

  it('keeps only names whose continent is in the allowed list', () => {
    expect(filterByContinents(entries, ['Europe']).sort()).toEqual(['France', 'Spain'])
  })

  it('supports multiple allowed continents', () => {
    expect(filterByContinents(entries, ['Europe', 'Asia']).sort()).toEqual(['France', 'Japan', 'Spain'])
  })

  it('returns an empty array when no continent matches', () => {
    expect(filterByContinents(entries, ['Antarctica'])).toEqual([])
  })

  it('returns an empty array for an empty entry list', () => {
    expect(filterByContinents([], ['Europe'])).toEqual([])
  })
})

describe('pickRandom', () => {
  const names = ['a', 'b', 'c', 'd', 'e']

  it('returns n items', () => {
    expect(pickRandom(names, 3)).toHaveLength(3)
  })

  it('returns all items when n equals the input length, as a permutation', () => {
    const picked = pickRandom(names, names.length)
    expect(picked.sort()).toEqual([...names].sort())
  })

  it('never returns duplicates', () => {
    const picked = pickRandom(names, names.length)
    expect(new Set(picked).size).toBe(picked.length)
  })

  it('does not mutate the input array', () => {
    const copy = [...names]
    pickRandom(names, 3)
    expect(names).toEqual(copy)
  })

  it('caps at the input length when n exceeds it', () => {
    expect(pickRandom(names, 100)).toHaveLength(names.length)
  })

  it('returns an empty array when n is 0', () => {
    expect(pickRandom(names, 0)).toEqual([])
  })
})
