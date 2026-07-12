'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import NumberFlow from '@number-flow/react'
import { MultiplayerGlobe } from '@/components/multiplayer/MultiplayerGlobe'
import type { MultiplayerGlobeHandle } from '@/components/multiplayer/MultiplayerGlobe'
import { DIFFICULTY_LOD_LEVEL } from '@/lib/game/difficulty'
import type { RoundResult, Difficulty } from '@/lib/game/types'
import type { CursorData } from '@/lib/multiplayer/types'

const GAME_DURATION_S  = 60
const FEEDBACK_MS      = 1200
const BREATHER_MS      = 2800

interface Feedback {
  correct: boolean
  clicked: string | null  // null when the correct country was clicked
}

interface Props {
  targets:                string[]
  practice?:              boolean
  practiceTimeLimitMs?:   number | null
  difficulty?:            Difficulty
  cursors?:               CursorData[]
  initialPosition?:       { lat: number; lng: number }
  onCursorMove?:          (lat: number, lng: number) => void
  onCameraChange?:        (lat: number, lng: number) => void
  onEnd:                  (results: RoundResult[], elapsedMs?: number) => void
  onQuit?:                () => void  // if provided, Quit goes here instead of onEnd (play mode: back to home)
}

export function GameScreen({ targets, practice = false, practiceTimeLimitMs = null, difficulty = 'easy', cursors = [], initialPosition, onCursorMove, onCameraChange, onEnd, onQuit }: Props) {
  const practiceCountdown = practice && practiceTimeLimitMs != null

  const [currentIndex, setCurrentIndex] = useState(0)
  const [displaySeconds, setDisplaySeconds] = useState(() => {
    if (!practice) return GAME_DURATION_S
    if (practiceCountdown) return Math.ceil(practiceTimeLimitMs / 1000)
    return 0
  })
  const [feedback, setFeedback]         = useState<Feedback | null>(null)
  const [isLive, setIsLive]             = useState(false)

  const currentIndexRef = useRef(0)
  const resultsRef      = useRef<RoundResult[]>([])
  const startTimeRef    = useRef(performance.now())
  const doneRef         = useRef(false)
  const endedRef        = useRef(false)
  // timed mode or practice countdown: when the game ends (absolute timestamp)
  const gameEndRef      = useRef(Date.now() + (practiceCountdown ? practiceTimeLimitMs : GAME_DURATION_S * 1000))
  // free practice mode: when the game started (adjusted to exclude paused time)
  const gameStartRef    = useRef(Date.now())
  const pausedAtRef     = useRef<number | null>(null)
  const globeRef        = useRef<MultiplayerGlobeHandle>(null)
  const onEndRef        = useRef(onEnd)
  onEndRef.current      = onEnd

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
  }, [practice, practiceCountdown])

  // Each new country: go live immediately, unpausing the clock if it was paused
  useEffect(() => {
    if (pausedAtRef.current !== null) {
      const pausedDuration = Date.now() - pausedAtRef.current
      if (practice && !practiceCountdown) {
        gameStartRef.current += pausedDuration  // shift start forward to exclude pause
      } else {
        gameEndRef.current += pausedDuration    // shift end forward to exclude pause
      }
      pausedAtRef.current = null
    }
    setIsLive(true)
  }, [currentIndex, practice, practiceCountdown])

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
    setCurrentIndex(next)
    doneRef.current = false
    startTimeRef.current = performance.now()
    setFeedback(null)
  }, [practice, practiceCountdown, practiceTimeLimitMs, targets.length])

  const handleSkip = useCallback(() => {
    if (doneRef.current || endedRef.current) return
    doneRef.current = true
    resultsRef.current.push({ country: targets[currentIndexRef.current], outcome: 'skipped', timeMs: Math.round(performance.now() - startTimeRef.current) })
    advance()
  }, [targets, advance])

  const onQuitRef = useRef(onQuit)
  onQuitRef.current = onQuit

  const handleQuit = useCallback(() => {
    if (endedRef.current) return
    endedRef.current = true
    if (onQuitRef.current) {
      onQuitRef.current()
    } else {
      onEndRef.current([...resultsRef.current], Date.now() - gameStartRef.current)
    }
  }, [])

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
  }, [targets, advance])

  const country = targets[currentIndex] ?? ''

  // Derive left-column display
  const isFeedback     = feedback !== null
  const leftLabel      = isFeedback ? 'You clicked' : 'Find'
  const leftCountry    = isFeedback ? (feedback.clicked ?? country) : country
  const leftCountryClr = isFeedback
    ? (feedback.correct ? 'text-emerald-500' : 'text-rose-400')
    : 'text-gray-800'

  return (
    <div className="relative w-screen h-dvh">
      <MultiplayerGlobe
        ref={globeRef}
        onSelect={handleSelect}
        onCursorMove={onCursorMove}
        onCameraChange={onCameraChange}
        cursors={cursors}
        currentStatus={practice ? 'practice' : 'playing'}
        initialPosition={initialPosition}
        showLabel={false}
        interactive={isLive}
        minLodLevel={DIFFICULTY_LOD_LEVEL[difficulty]}
      />

      {/* HUD */}
      <div className="pointer-events-none absolute top-5 inset-x-0 px-4 md:px-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">

        {/* Controls card */}
        <div className="pointer-events-auto w-full rounded-2xl bg-white/90 backdrop-blur-sm shadow px-5 py-3 flex items-center">
          <div className="flex items-center gap-2">
            <button
              onClick={handleQuit}
              className="rounded-full px-4 py-1.5 text-sm font-semibold
                transition-all duration-300 select-none
                bg-black/6 text-gray-600 cursor-pointer hover:bg-black/10 active:scale-95"
            >
              {practice ? 'stop' : 'quit'}
            </button>
            <button
              onClick={handleSkip}
              disabled={!isLive}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold
                transition-all duration-300 select-none
                ${isLive
                  ? 'bg-black/6 text-gray-600 cursor-pointer hover:bg-black/10 active:scale-95'
                  : 'bg-black/4 text-gray-300 cursor-default'
                }`}
            >
              skip
            </button>
          </div>
          <p className="flex-1 text-center text-sm font-semibold text-gray-500 uppercase tracking-widest">
            {practice ? 'Practice' : '1 minute'}
          </p>
          <div className="flex items-center gap-2.5">
            <span className={`text-sm font-semibold tabular-nums transition-colors duration-300 ${
              !isLive
                ? 'text-gray-300'
                : (practiceCountdown || !practice) && displaySeconds <= 10
                  ? 'text-rose-400'
                  : 'text-gray-500'
            }`}>
              {displaySeconds >= 60
                ? <><NumberFlow value={Math.floor(displaySeconds / 60)} />m <NumberFlow value={displaySeconds % 60} />s</>
                : <><NumberFlow value={displaySeconds} />s</>
              }
            </span>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 active:scale-95 transition-all duration-150 text-xl"
              onClick={() => globeRef.current?.reset()}
              title="Reset view"
            >
              🌍
            </button>
          </div>
        </div>

        {/* Country prompt card */}
        <div key={`${leftLabel}-${leftCountry}`} className="pointer-events-auto anim-fade-up w-full rounded-2xl bg-white/90 backdrop-blur-sm shadow px-5 py-3 flex flex-col gap-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 leading-none">
            {leftLabel}
          </p>
          <p className={`text-xl font-bold leading-tight transition-colors duration-300 ${leftCountryClr}`}>
            {leftCountry}
          </p>
        </div>

        </div>
      </div>
    </div>
  )
}
