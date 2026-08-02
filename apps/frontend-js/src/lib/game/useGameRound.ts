'use client'

import { useState, useRef, useCallback, useEffect, type RefObject } from 'react'
import { useLatestRef } from '@/lib/useLatestRef'
import type { MultiplayerGlobeHandle } from '@/components/multiplayer/MultiplayerGlobe'
import type { RoundResult } from './types'

const GAME_DURATION_S = 60
const FEEDBACK_MS     = 1200
const BREATHER_MS     = 2800

export interface Feedback {
  correct: boolean
  clicked: string | null  // null when the correct country was clicked
}

interface UseGameRoundOptions {
  targets:              string[]
  practice:             boolean
  practiceTimeLimitMs:  number | null
  globeRef:             RefObject<MultiplayerGlobeHandle | null>
  onEnd:                (results: RoundResult[], elapsedMs?: number) => void
  onQuit?:              () => void  // if provided, quit goes here instead of onEnd
}

// The round/timer/pause state machine driving GameScreen: tracks the current
// target, the countdown/elapsed clock (which pauses during the correct/wrong
// feedback breather), and scoring. Owns the imperative globe highlight/flyTo
// calls that accompany a selection, since they're tied 1:1 to state
// transitions here, not to rendering.
export function useGameRound({ targets, practice, practiceTimeLimitMs, globeRef, onEnd, onQuit }: UseGameRoundOptions) {
  const practiceCountdown = practice && practiceTimeLimitMs != null

  const [currentIndex, setCurrentIndex]     = useState(0)
  const [displaySeconds, setDisplaySeconds] = useState(() => {
    if (!practice) return GAME_DURATION_S
    if (practiceCountdown) return Math.ceil(practiceTimeLimitMs / 1000)
    return 0
  })
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  // the first round is live immediately —
  // later rounds are (re-)activated inside advance().
  const [isLive, setIsLive]     = useState(true)

  const [initialNow]  = useState(() => Date.now())
  const [initialPerf] = useState(() => performance.now())

  const currentIndexRef = useRef(0)
  const resultsRef      = useRef<RoundResult[]>([])
  const startTimeRef    = useRef(initialPerf)
  const doneRef         = useRef(false)
  const endedRef        = useRef(false)
  // timed mode or practice countdown: when the game ends (absolute timestamp)
  const gameEndRef      = useRef(initialNow + (practiceCountdown ? practiceTimeLimitMs : GAME_DURATION_S * 1000))
  // free practice mode: when the game started (adjusted to exclude paused time)
  const gameStartRef    = useRef(initialNow)
  const pausedAtRef     = useRef<number | null>(null)
  const onEndRef        = useLatestRef(onEnd)
  const onQuitRef       = useLatestRef(onQuit)

  // Game clock — skips when paused (feedback phase)
  useEffect(() => {
    const id = setInterval(() => {
      if (pausedAtRef.current !== null) return
      if (practice && !practiceCountdown) {
        setDisplaySeconds(Math.floor((Date.now() - gameStartRef.current) / 1000))
      } else {
        const remaining = Math.ceil((gameEndRef.current - Date.now()) / 1000)
        const clamped   = Math.max(0, remaining)
        setDisplaySeconds(clamped)
        if (clamped === 0 && !endedRef.current) {
          endedRef.current = true
          clearInterval(id)
          const elapsed = practiceCountdown ? practiceTimeLimitMs! : undefined
          onEndRef.current([...resultsRef.current], elapsed)
        }
      }
    }, 200)
    return () => clearInterval(id)
  }, [practice, practiceCountdown, practiceTimeLimitMs, onEndRef])

  const advance = useCallback(() => {
    if (endedRef.current) return
    const next = currentIndexRef.current + 1
    currentIndexRef.current = next
    if (practice && next >= targets.length) {
      endedRef.current = true
      setFeedback(null)
      const elapsed = practiceCountdown
        ? practiceTimeLimitMs! - Math.max(0, gameEndRef.current - Date.now())
        : Date.now() - gameStartRef.current
      onEndRef.current([...resultsRef.current], elapsed)
      return
    }
    // Unpause the clock, if it was paused, before starting the next round
    if (pausedAtRef.current !== null) {
      const pausedDuration = Date.now() - pausedAtRef.current
      if (practice && !practiceCountdown) {
        gameStartRef.current += pausedDuration  // shift start forward to exclude pause
      } else {
        gameEndRef.current += pausedDuration    // shift end forward to exclude pause
      }
      pausedAtRef.current = null
    }
    setCurrentIndex(next)
    doneRef.current = false
    startTimeRef.current = performance.now()
    setFeedback(null)
    setIsLive(true)
  }, [practice, practiceCountdown, practiceTimeLimitMs, targets.length, onEndRef])

  const handleSkip = useCallback(() => {
    if (doneRef.current || endedRef.current) return
    doneRef.current = true
    resultsRef.current.push({ country: targets[currentIndexRef.current], outcome: 'skipped', timeMs: Math.round(performance.now() - startTimeRef.current) })
    advance()
  }, [targets, advance])

  const handleQuit = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    if (onQuitRef.current) {
      onQuitRef.current()
    } else {
      onEndRef.current([...resultsRef.current], Date.now() - gameStartRef.current)
    }
  }, [onQuitRef, onEndRef])

  const handleSelect = useCallback((name: string | null) => {
    if (!name || doneRef.current || endedRef.current) return
    doneRef.current = true
    const country = targets[currentIndexRef.current]
    const correct = name === country
    resultsRef.current.push({
      country,
      outcome: correct ? 'correct' : 'wrong',
      timeMs: Math.round(performance.now() - startTimeRef.current),
    })
    setFeedback({ correct, clicked: correct ? null : name })
    setIsLive(false)
    if (correct) {
      globeRef.current?.highlightCorrect(country)
      setTimeout(advance, FEEDBACK_MS)
    } else {
      // Pause the clock for the breather period
      pausedAtRef.current = Date.now()
      globeRef.current?.focusWrong(country)
      globeRef.current?.flyTo(country)
      // settle to the normal wrong-red right as gameplay resumes
      setTimeout(() => {
        globeRef.current?.highlightWrong(country)
        advance()
      }, BREATHER_MS)
    }
  }, [targets, advance, globeRef])

  return {
    currentIndex,
    displaySeconds,
    feedback,
    isLive,
    practiceCountdown,
    country: targets[currentIndex] ?? '',
    handleSkip,
    handleQuit,
    handleSelect,
  }
}
