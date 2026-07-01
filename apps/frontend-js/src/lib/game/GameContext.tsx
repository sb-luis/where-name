'use client'

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useCountryEntries, pickRandom, filterByContinents, CONTINENTS } from './countries'
import type { RoundResult } from './types'

export interface LatLng { lat: number; lng: number }

interface GameContextValue {
  countryNames:           string[]
  targets:                string[]
  results:                RoundResult[] | null
  mode:                   'timed' | 'practice'
  elapsedMs:              number | null
  practiceTimeLimitMs:    number | null
  startGame:              () => void
  startPractice:          (timeLimitMs: number | null, continents?: readonly string[]) => void
  setResults:             (results: RoundResult[]) => void
  setElapsedMs:           (ms: number | null) => void
  cameraOrientationRef:   React.MutableRefObject<LatLng | null>
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const countryEntries                        = useCountryEntries()
  const countryNames                          = useMemo(() => countryEntries.map(e => e.name), [countryEntries])
  const [targets, setTargets]                 = useState<string[]>([])
  const [results, setResults]                 = useState<RoundResult[] | null>(null)
  const [mode, setMode]                       = useState<'timed' | 'practice'>('timed')
  const [elapsedMs, setElapsedMs]             = useState<number | null>(null)
  const [practiceTimeLimitMs, setPracticeTimeLimitMs] = useState<number | null>(null)
  const cameraOrientationRef                  = useRef<LatLng | null>(null)

  const startGame = useCallback(() => {
    if (!countryNames.length) return
    setMode('timed')
    setElapsedMs(null)
    setTargets(pickRandom(countryNames, countryNames.length))
    setResults(null)
  }, [countryNames])

  const startPractice = useCallback((timeLimitMs: number | null, continents: readonly string[] = CONTINENTS) => {
    const pool = filterByContinents(countryEntries, continents)
    if (!pool.length) return
    setMode('practice')
    setElapsedMs(null)
    setPracticeTimeLimitMs(timeLimitMs)
    setTargets(pickRandom(pool, pool.length))
    setResults(null)
  }, [countryEntries])

  return (
    <GameContext.Provider value={{ countryNames, targets, results, mode, elapsedMs, practiceTimeLimitMs, startGame, startPractice, setResults, setElapsedMs, cameraOrientationRef }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside GameProvider')
  return ctx
}
