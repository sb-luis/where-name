import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useGameRound } from './useGameRound'
import type { MultiplayerGlobeHandle } from '@/components/multiplayer/MultiplayerGlobe'

function mockGlobeRef() {
  return {
    current: {
      reset:            vi.fn(),
      flyTo:            vi.fn(),
      highlightCorrect: vi.fn(),
      highlightWrong:   vi.fn(),
      focusWrong:       vi.fn(),
      clearHighlight:   vi.fn(),
    },
  } as { current: MultiplayerGlobeHandle | null }
}

function renderRound(overrides: Partial<Parameters<typeof useGameRound>[0]> = {}) {
  const onEnd    = vi.fn()
  const globeRef = mockGlobeRef()
  const { result } = renderHook(() => useGameRound({
    targets:             ['Spain', 'France', 'Italy'],
    practice:            false,
    practiceTimeLimitMs: null,
    globeRef,
    onEnd,
    ...overrides,
  }))
  return { result, onEnd, globeRef }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('useGameRound', () => {
  it('starts on the first target, live (mount effect runs synchronously), no feedback', () => {
    const { result } = renderRound()
    expect(result.current.country).toBe('Spain')
    expect(result.current.isLive).toBe(true)
    expect(result.current.feedback).toBeNull()
  })

  describe('handleSelect — correct', () => {
    it('sets correct feedback, highlights, and advances after the feedback delay', () => {
      const { result, globeRef } = renderRound()

      act(() => result.current.handleSelect('Spain'))
      expect(result.current.feedback).toEqual({ correct: true, clicked: null })
      expect(result.current.isLive).toBe(false)
      expect(globeRef.current!.highlightCorrect).toHaveBeenCalledWith('Spain')

      act(() => vi.advanceTimersByTime(1200))
      expect(result.current.country).toBe('France')
      expect(result.current.feedback).toBeNull()
    })

    it('ignores a second selection once done for the round', () => {
      const { result, globeRef } = renderRound()
      act(() => vi.advanceTimersByTime(0))
      act(() => result.current.handleSelect('Spain'))
      act(() => result.current.handleSelect('Spain'))
      expect(globeRef.current!.highlightCorrect).toHaveBeenCalledTimes(1)
    })
  })

  describe('handleSelect — wrong', () => {
    it('pauses the clock, flies to the target, and advances after the breather', () => {
      const { result, globeRef } = renderRound()
      act(() => vi.advanceTimersByTime(0))

      act(() => result.current.handleSelect('France'))
      expect(result.current.feedback).toEqual({ correct: false, clicked: 'France' })
      expect(globeRef.current!.focusWrong).toHaveBeenCalledWith('Spain')
      expect(globeRef.current!.flyTo).toHaveBeenCalledWith('Spain')

      const pausedSeconds = result.current.displaySeconds
      act(() => vi.advanceTimersByTime(600))
      // clock is paused during the breather — display shouldn't tick down
      expect(result.current.displaySeconds).toBe(pausedSeconds)

      act(() => vi.advanceTimersByTime(2200)) // finish the 2800ms breather
      expect(globeRef.current!.highlightWrong).toHaveBeenCalledWith('Spain')
      expect(result.current.country).toBe('France')
    })
  })

  it('handleSkip records a skip and advances without touching the globe highlight', () => {
    const { result, globeRef } = renderRound()
    act(() => vi.advanceTimersByTime(0))
    act(() => result.current.handleSkip())
    expect(result.current.country).toBe('France')
    expect(globeRef.current!.highlightCorrect).not.toHaveBeenCalled()
    expect(globeRef.current!.highlightWrong).not.toHaveBeenCalled()
  })

  describe('handleQuit', () => {
    it('calls onQuit instead of onEnd when provided', () => {
      const onQuit = vi.fn()
      const { result, onEnd } = renderRound({ onQuit })
      act(() => result.current.handleQuit())
      expect(onQuit).toHaveBeenCalled()
      expect(onEnd).not.toHaveBeenCalled()
    })

    it('falls back to onEnd with elapsed results when no onQuit is given', () => {
      const { result, onEnd } = renderRound()
      act(() => vi.advanceTimersByTime(0))
      act(() => result.current.handleSkip())
      act(() => result.current.handleQuit())
      expect(onEnd).toHaveBeenCalledTimes(1)
      const [results] = onEnd.mock.calls[0]
      expect(results).toEqual([{ country: 'Spain', outcome: 'skipped', timeMs: expect.any(Number) }])
    })

    it('is a no-op once the round has already ended', () => {
      const onQuit = vi.fn()
      const { result } = renderRound({ onQuit })
      act(() => result.current.handleQuit())
      act(() => result.current.handleQuit())
      expect(onQuit).toHaveBeenCalledTimes(1)
    })
  })

  describe('practice mode', () => {
    it('ends with elapsed time once the last target is skipped', () => {
      const { result, onEnd } = renderRound({
        targets: ['Spain'],
        practice: true,
        practiceTimeLimitMs: null,
      })
      act(() => vi.advanceTimersByTime(0))
      act(() => result.current.handleSkip())
      expect(onEnd).toHaveBeenCalledTimes(1)
      const [results, elapsedMs] = onEnd.mock.calls[0]
      expect(results).toHaveLength(1)
      expect(elapsedMs).toEqual(expect.any(Number))
    })

    it('with a countdown, ends automatically once time runs out', () => {
      const { result, onEnd } = renderRound({
        practice: true,
        practiceTimeLimitMs: 1000,
      })
      expect(result.current.practiceCountdown).toBe(true)
      expect(result.current.displaySeconds).toBe(1)

      act(() => vi.advanceTimersByTime(1200))
      expect(onEnd).toHaveBeenCalledWith([], 1000)
    })
  })

  describe('timed mode', () => {
    it('ends automatically once the clock reaches zero', () => {
      const { result, onEnd } = renderRound()
      expect(result.current.displaySeconds).toBe(60)

      act(() => vi.advanceTimersByTime(60_200))
      expect(onEnd).toHaveBeenCalledTimes(1)
      const [results, elapsedMs] = onEnd.mock.calls[0]
      expect(results).toEqual([])
      expect(elapsedMs).toBeUndefined()
    })
  })
})
