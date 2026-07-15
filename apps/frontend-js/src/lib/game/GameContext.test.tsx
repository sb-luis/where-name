import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { GameProvider, useGame } from './GameContext'
import { CONTINENTS } from './countries'
import type { RoundResult } from './types'

function renderGame() {
  return renderHook(() => useGame(), { wrapper: GameProvider })
}

describe('useGame', () => {
  it('throws when used outside a GameProvider', () => {
    expect(() => renderHook(() => useGame())).toThrow('useGame must be used inside GameProvider')
  })

  it('exposes the full easy-tier country pool as countryNames', () => {
    const { result } = renderGame()
    expect(result.current.countryNames.length).toBeGreaterThan(0)
  })

  describe('startGame', () => {
    it('resets to a timed easy-difficulty round with a full shuffled target list', () => {
      const { result } = renderGame()
      const poolSize = result.current.countryNames.length

      act(() => result.current.startGame())

      expect(result.current.mode).toBe('timed')
      expect(result.current.difficulty).toBe('easy')
      expect(result.current.elapsedMs).toBeNull()
      expect(result.current.results).toBeNull()
      expect(result.current.targets).toHaveLength(poolSize)
      expect(new Set(result.current.targets)).toEqual(new Set(result.current.countryNames))
    })

    it('clears previous results and elapsed time', () => {
      const { result } = renderGame()
      const stale: RoundResult[] = [{ country: 'Spain', outcome: 'correct', timeMs: 100 }]

      act(() => {
        result.current.setResults(stale)
        result.current.setElapsedMs(5000)
      })
      act(() => result.current.startGame())

      expect(result.current.results).toBeNull()
      expect(result.current.elapsedMs).toBeNull()
    })
  })

  describe('startPractice', () => {
    it('sets practice mode with the given time limit and difficulty', () => {
      const { result } = renderGame()

      act(() => result.current.startPractice(60_000, CONTINENTS, 'medium'))

      expect(result.current.mode).toBe('practice')
      expect(result.current.practiceTimeLimitMs).toBe(60_000)
      expect(result.current.difficulty).toBe('medium')
      expect(result.current.targets.length).toBeGreaterThan(0)
      expect(result.current.results).toBeNull()
    })

    it('defaults to all continents and easy difficulty when omitted', () => {
      const { result } = renderGame()

      act(() => result.current.startPractice(null))

      expect(result.current.difficulty).toBe('easy')
      expect(result.current.targets.length).toBeGreaterThan(0)
    })

    it('is a no-op when the resulting pool is empty', () => {
      const { result } = renderGame()
      act(() => result.current.startGame())
      const targetsBefore = result.current.targets

      act(() => result.current.startPractice(null, []))

      expect(result.current.targets).toBe(targetsBefore)
      expect(result.current.mode).toBe('timed')
    })
  })

  describe('startPracticeWithTargets', () => {
    it('sets practice mode with exactly the given names, shuffled', () => {
      const { result } = renderGame()
      const names = ['Spain', 'France', 'Italy']

      act(() => result.current.startPracticeWithTargets(names))

      expect(result.current.mode).toBe('practice')
      expect(new Set(result.current.targets)).toEqual(new Set(names))
      expect(result.current.results).toBeNull()
    })

    it('is a no-op for an empty name list', () => {
      const { result } = renderGame()
      act(() => result.current.startGame())
      const targetsBefore = result.current.targets

      act(() => result.current.startPracticeWithTargets([]))

      expect(result.current.targets).toBe(targetsBefore)
    })
  })

  describe('setters', () => {
    it('updates streakInfo and unlockedAchievements independently', () => {
      const { result } = renderGame()

      act(() => {
        result.current.setStreakInfo({ current: 3, longest: 7 })
        result.current.setUnlockedAchievements([{ slug: 'x', name: 'X', description: 'd' }])
      })

      expect(result.current.streakInfo).toEqual({ current: 3, longest: 7 })
      expect(result.current.unlockedAchievements).toEqual([{ slug: 'x', name: 'X', description: 'd' }])
    })
  })
})
