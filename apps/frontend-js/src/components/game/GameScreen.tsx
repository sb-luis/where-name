'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import NumberFlow from '@number-flow/react'
import { MultiplayerGlobe } from '@/components/multiplayer/MultiplayerGlobe'
import type { MultiplayerGlobeHandle } from '@/components/multiplayer/MultiplayerGlobe'
import type { RoundResult } from '@/lib/game/types'
import type { CursorData } from '@/lib/multiplayer/types'

const GAME_DURATION_S  = 60
const FEEDBACK_MS      = 1200
const BREATHER_MS      = 2800

interface Feedback {
  correct: boolean
  clicked: string | null  // null when the correct country was clicked
}

interface Props {
  targets:          string[]
  practice?:        boolean
  cursors?:         CursorData[]
  initialPosition?: { lat: number; lng: number }
  onCursorMove?:    (lat: number, lng: number) => void
  onCameraChange?:  (lat: number, lng: number) => void
  onEnd:            (results: RoundResult[], elapsedSeconds?: number) => void
  onQuit?:          () => void  // if provided, Quit goes here instead of onEnd (play mode: back to home)
}

export function GameScreen({ targets, practice = false, cursors = [], initialPosition, onCursorMove, onCameraChange, onEnd, onQuit }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [displaySeconds, setDisplaySeconds] = useState(practice ? 0 : GAME_DURATION_S)
  const [feedback, setFeedback]         = useState<Feedback | null>(null)
  const [isLive, setIsLive]             = useState(false)

  const currentIndexRef = useRef(0)
  const resultsRef      = useRef<RoundResult[]>([])
  const startTimeRef    = useRef(performance.now())
  const doneRef         = useRef(false)
  const endedRef        = useRef(false)
  // timed mode: when the game ends (absolute timestamp)
  const gameEndRef      = useRef(Date.now() + GAME_DURATION_S * 1000)
  // practice mode: when the game started (adjusted to exclude paused time)
  const gameStartRef    = useRef(Date.now())
  const pausedAtRef     = useRef<number | null>(null)
  const globeRef        = useRef<MultiplayerGlobeHandle>(null)
  const onEndRef        = useRef(onEnd)
  onEndRef.current      = onEnd

  // Game clock — skips when paused (feedback phase)
  useEffect(() => {
    const id = setInterval(() => {
      if (pausedAtRef.current !== null) return
      if (practice) {
        setDisplaySeconds(Math.floor((Date.now() - gameStartRef.current) / 1000))
      } else {
        const remaining = Math.ceil((gameEndRef.current - Date.now()) / 1000)
        const clamped   = Math.max(0, remaining)
        setDisplaySeconds(clamped)
        if (clamped === 0 && !endedRef.current) {
          endedRef.current = true
          clearInterval(id)
          onEndRef.current([...resultsRef.current])
        }
      }
    }, 200)
    return () => clearInterval(id)
  }, [practice])

  // Each new country: go live immediately, unpausing the clock if it was paused
  useEffect(() => {
    if (pausedAtRef.current !== null) {
      const pausedDuration = Date.now() - pausedAtRef.current
      if (practice) {
        gameStartRef.current += pausedDuration  // shift start forward to exclude pause
      } else {
        gameEndRef.current += pausedDuration    // shift end forward to exclude pause
      }
      pausedAtRef.current = null
    }
    setIsLive(true)
  }, [currentIndex, practice])

  const advance = useCallback(() => {
    if (endedRef.current) return
    const next = currentIndexRef.current + 1
    currentIndexRef.current = next
    if (practice && next >= targets.length) {
      endedRef.current = true
      setFeedback(null)
      onEndRef.current([...resultsRef.current], Math.floor((Date.now() - gameStartRef.current) / 1000))
      return
    }
    setCurrentIndex(next)
    doneRef.current = false
    startTimeRef.current = performance.now()
    setFeedback(null)
  }, [practice, targets.length])

  const handleSkip = useCallback(() => {
    if (doneRef.current || endedRef.current) return
    doneRef.current = true
    resultsRef.current.push({ country: targets[currentIndexRef.current], outcome: 'skipped' })
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
      onEndRef.current([...resultsRef.current], Math.floor((Date.now() - gameStartRef.current) / 1000))
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
      ...(correct && { timeMs: Math.round(performance.now() - startTimeRef.current) }),
    })
    setFeedback({ correct, clicked: correct ? null : name })
    setIsLive(false)
    if (correct) {
      globeRef.current?.highlightCorrect(country)
      setTimeout(advance, FEEDBACK_MS)
    } else {
      // Pause the clock for the breather period
      pausedAtRef.current = Date.now()
      globeRef.current?.highlightWrong(country)
      globeRef.current?.flyTo(country)
      setTimeout(advance, BREATHER_MS)
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
      />

      {/* HUD card */}
      <div className="pointer-events-none absolute top-5 inset-x-0 px-5">
        <div className="pointer-events-auto w-full rounded-2xl bg-white/90 backdrop-blur-sm shadow px-5 py-3 flex flex-col md:flex-row md:items-center gap-3">

          {/* Mobile: one row (buttons left, timer right). Desktop: contents — children join outer flex directly */}
          <div className="flex items-center justify-between md:contents">
            <div className="flex items-center gap-2 md:order-2">
              <button
                onClick={handleQuit}
                className="rounded-full px-4 py-1.5 text-sm font-semibold
                  transition-all duration-300 select-none
                  bg-black/6 text-gray-600 cursor-pointer hover:bg-black/10 active:scale-95"
              >
                Quit
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
                Skip
              </button>
            </div>
            <div className="flex items-center gap-2.5 md:order-3">
              <span className={`text-sm font-semibold tabular-nums transition-colors duration-300 ${
                !isLive
                  ? 'text-gray-300'
                  : practice
                    ? 'text-gray-500'
                    : displaySeconds <= 10
                      ? 'text-rose-400'
                      : 'text-gray-500'
              }`}>
                {practice && displaySeconds >= 60
                  ? <><NumberFlow value={Math.floor(displaySeconds / 60)} />m <NumberFlow value={displaySeconds % 60} />s</>
                  : <><NumberFlow value={displaySeconds} />s</>
                }
              </span>
              <button
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 active:scale-95 transition-all duration-150 text-base"
                onClick={() => globeRef.current?.reset()}
                title="Reset view"
              >
                🌍
              </button>
            </div>
          </div>

          {/* Country prompt — centered on mobile, left-aligned on desktop */}
          <div key={`${leftLabel}-${leftCountry}`} className="anim-fade-up text-center md:text-left md:flex-1 md:min-w-0 md:order-1 flex flex-col gap-0.5">
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
