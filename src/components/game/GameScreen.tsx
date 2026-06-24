'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import NumberFlow from '@number-flow/react'
import { Globe } from '@/components/globe/Globe'
import type { GlobeHandle } from '@/components/globe/Globe'
import type { RoundResult } from '@/lib/game/types'

const GAME_DURATION_S  = 60
const FEEDBACK_MS      = 1200 
const BREATHER_MS      = 2800

interface Feedback {
  correct: boolean
  clicked: string | null  // null when the correct country was clicked
}

interface Props {
  targets: string[]
  onEnd: (results: RoundResult[]) => void
}

export function GameScreen({ targets, onEnd }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [secondsLeft, setSecondsLeft]   = useState(GAME_DURATION_S)
  const [feedback, setFeedback]         = useState<Feedback | null>(null)
  const [isLive, setIsLive]             = useState(false)

  const currentIndexRef = useRef(0)
  const resultsRef      = useRef<RoundResult[]>([])
  const startTimeRef    = useRef(performance.now())
  const doneRef         = useRef(false)
  const endedRef        = useRef(false)
  const gameEndRef      = useRef(Date.now() + GAME_DURATION_S * 1000)
  const pausedAtRef     = useRef<number | null>(null)
  const globeRef        = useRef<GlobeHandle>(null)
  const onEndRef        = useRef(onEnd)
  onEndRef.current      = onEnd

  // Game clock — skips when paused (find phase or feedback)
  useEffect(() => {
    const id = setInterval(() => {
      if (pausedAtRef.current !== null) return
      const remaining = Math.ceil((gameEndRef.current - Date.now()) / 1000)
      const clamped   = Math.max(0, remaining)
      setSecondsLeft(clamped)
      if (clamped === 0 && !endedRef.current) {
        endedRef.current = true
        clearInterval(id)
        onEndRef.current([...resultsRef.current])
      }
    }, 200)
    return () => clearInterval(id)
  }, [])

  // Each new country: go live immediately, unpausing the clock if it was paused
  useEffect(() => {
    if (pausedAtRef.current !== null) {
      gameEndRef.current += Date.now() - pausedAtRef.current
      pausedAtRef.current = null
    }
    setIsLive(true)
  }, [currentIndex])

  const advance = useCallback(() => {
    if (endedRef.current) return
    globeRef.current?.clearHighlight()
    setCurrentIndex(prev => {
      const next = prev + 1
      currentIndexRef.current = next
      return next
    })
    doneRef.current = false
    startTimeRef.current = performance.now()
    setFeedback(null)
  }, [])

  const handleSkip = useCallback(() => {
    if (doneRef.current || endedRef.current) return
    doneRef.current = true
    resultsRef.current.push({ country: targets[currentIndexRef.current], outcome: 'skipped' })
    advance()
  }, [targets, advance])

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
      <Globe ref={globeRef} onSelect={handleSelect} showLabel={false} interactive={isLive} />

      {/* Single full-width top card containing all HUD elements */}
      <div className="pointer-events-none absolute top-5 inset-x-0 px-5">
        <div className="pointer-events-auto h-[72px] w-full rounded-2xl bg-white/90 backdrop-blur-sm shadow px-5 flex items-center gap-3">

          {/* Left: stacked label + country name */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
            <div key={`${leftLabel}-${leftCountry}`} className="anim-fade-up flex flex-col gap-0.5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 leading-none">
                {leftLabel}
              </p>
              <p className={`text-xl font-bold truncate leading-tight transition-colors duration-300 ${leftCountryClr}`}>
                {leftCountry}
              </p>
            </div>
          </div>

          {/* Centre: Skip button — fades active/inactive with the game state */}
          <button
            onClick={handleSkip}
            disabled={!isLive}
            className={`flex-shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold
              transition-all duration-300 select-none
              ${isLive
                ? 'bg-black/6 text-gray-600 cursor-pointer hover:bg-black/10 active:scale-95'
                : 'bg-black/4 text-gray-300 cursor-default'
              }`}
          >
            Skip
          </button>

          {/* Right: timer + reset */}
          <div className="flex-shrink-0 flex items-center gap-2.5">
            <span className={`text-sm font-semibold tabular-nums transition-colors duration-300 ${
              !isLive
                ? 'text-gray-300'
                : secondsLeft <= 10
                  ? 'text-rose-400'
                  : 'text-gray-500'
            }`}>
              <NumberFlow value={secondsLeft} />s
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
      </div>
    </div>
  )
}
