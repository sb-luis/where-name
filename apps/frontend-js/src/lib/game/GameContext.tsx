'use client'

import {
  createContext,
  useContext,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useCountryNames, pickRandom } from './countries'
import type { RoundResult } from './types'

export interface LatLng { lat: number; lng: number }

interface GameContextValue {
  countryNames:         string[]
  targets:              string[]
  results:              RoundResult[] | null
  mode:                 'timed' | 'practice'
  elapsedSeconds:       number | null
  startGame:            () => void
  startPractice:        () => void
  setResults:           (results: RoundResult[]) => void
  setElapsedSeconds:    (s: number | null) => void
  cameraOrientationRef: React.MutableRefObject<LatLng | null>
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const countryNames                          = useCountryNames()
  const [targets, setTargets]                 = useState<string[]>([])
  const [results, setResults]                 = useState<RoundResult[] | null>(null)
  const [mode, setMode]                       = useState<'timed' | 'practice'>('timed')
  const [elapsedSeconds, setElapsedSeconds]   = useState<number | null>(null)
  const cameraOrientationRef                  = useRef<LatLng | null>(null)

  const startGame = useCallback(() => {
    if (!countryNames.length) return
    setMode('timed')
    setElapsedSeconds(null)
    setTargets(pickRandom(countryNames, countryNames.length))
    setResults(null)
  }, [countryNames])

  const startPractice = useCallback(() => {
    if (!countryNames.length) return
    setMode('practice')
    setElapsedSeconds(null)
    setTargets(pickRandom(countryNames, countryNames.length))
    setResults(null)
  }, [countryNames])

  return (
    <GameContext.Provider value={{ countryNames, targets, results, mode, elapsedSeconds, startGame, startPractice, setResults, setElapsedSeconds, cameraOrientationRef }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside GameProvider')
  return ctx
}
