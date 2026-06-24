'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import NumberFlow from '@number-flow/react'
import { Globe } from '@/components/globe/Globe'
import type { RoundResult } from '@/lib/game/types'

const GAME_DURATION_S = 60
const FEEDBACK_MS     = 900

interface Props {
  targets: string[]
  onEnd: (results: RoundResult[]) => void
}

type Feedback = { correct: boolean; clicked: string | null } | null

export function GameScreen({ targets, onEnd }: Props) {
  const [currentIndex, setCurrentIndex]   = useState(0)
  const [secondsLeft, setSecondsLeft]     = useState(GAME_DURATION_S)
  const [correctCount, setCorrectCount]   = useState(0)
  const [feedback, setFeedback]           = useState<Feedback>(null)

  const currentIndexRef = useRef(0)
  const resultsRef      = useRef<RoundResult[]>([])
  const startTimeRef    = useRef(performance.now())
  const doneRef         = useRef(false)
  const endedRef        = useRef(false)
  const onEndRef        = useRef(onEnd)
  onEndRef.current      = onEnd

  // Single interval drives the whole game clock — avoids drift.
  useEffect(() => {
    const gameEnd = Date.now() + GAME_DURATION_S * 1000
    const id = setInterval(() => {
      const remaining = Math.ceil((gameEnd - Date.now()) / 1000)
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

  const advance = useCallback(() => {
    if (endedRef.current) return
    setCurrentIndex(prev => {
      const next = prev + 1
      currentIndexRef.current = next
      return next
    })
    doneRef.current = false
    startTimeRef.current = performance.now()
    setFeedback(null)
  }, [])

  const record = useCallback(
    (correct: boolean, clicked: string | null = null) => {
      if (doneRef.current || endedRef.current) return
      doneRef.current = true
      const country = targets[currentIndexRef.current]
      resultsRef.current.push({
        country,
        outcome: correct ? 'correct' : clicked ? 'wrong' : 'skipped',
        ...(correct && { timeMs: Math.round(performance.now() - startTimeRef.current) }),
      })
      if (correct) setCorrectCount(c => c + 1)
      setFeedback({ correct, clicked })
      setTimeout(advance, FEEDBACK_MS)
    },
    [targets, advance],
  )

  const handleSkip = useCallback(() => {
    if (doneRef.current || endedRef.current) return
    doneRef.current = true
    const country = targets[currentIndexRef.current]
    resultsRef.current.push({ country, outcome: 'skipped' })
    advance()
  }, [targets, advance])

  const handleSelect = useCallback(
    (name: string | null) => {
      if (!name) return
      const isCorrect = name === targets[currentIndexRef.current]
      record(isCorrect, isCorrect ? null : name)
    },
    [targets, record],
  )

  const country = targets[currentIndex] ?? ''

  return (
    <div className="relative w-screen h-screen">
      <Globe onSelect={handleSelect} showLabel={false} />

      {/* HUD: correct count (left) + game timer (right) */}
      <div className="pointer-events-none absolute top-4 inset-x-0 flex justify-between items-center px-6">
        <span className="text-sm font-medium text-gray-500 bg-white/80 rounded-full px-3 py-1 backdrop-blur-sm tabular-nums">
          ✓ <NumberFlow value={correctCount} />
        </span>
        <span className={`text-sm font-semibold rounded-full px-3 py-1 backdrop-blur-sm tabular-nums ${
          secondsLeft <= 10 ? 'bg-rose-500/20 text-rose-400' : 'bg-white/80 text-gray-500'
        }`}>
          <NumberFlow value={secondsLeft} />s
        </span>
      </div>

      {/* Country prompt card — updates in place to show feedback */}
      <div className="pointer-events-none absolute top-14 inset-x-0 flex justify-center px-6">
        <div className="bg-white/90 rounded-2xl px-6 py-3 shadow backdrop-blur-sm text-center w-full max-w-xs">
          {feedback ? (
            <>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">
                {feedback.correct ? 'Correct' : feedback.clicked ? 'You clicked' : 'Skipped'}
              </p>
              <p className="text-xl sm:text-2xl font-bold text-gray-800 mt-0.5 truncate">
                {feedback.clicked ?? country}
              </p>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-widest">Find</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-800 mt-0.5 truncate">{country}</p>
            </>
          )}
        </div>
      </div>

      {/* Skip button */}
      {!feedback && (
        <div className="absolute bottom-10 inset-x-0 flex justify-center px-6">
          <button
            onClick={handleSkip}
            className="w-full max-w-xs bg-white/80 backdrop-blur-sm rounded-full py-4 text-sm font-medium text-gray-400 shadow-sm border border-white/60 hover:bg-white/95 hover:text-gray-600 active:scale-95 transition-all duration-150"
          >
            Skip
          </button>
        </div>
      )}
    </div>
  )
}
