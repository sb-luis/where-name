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
import { pickRandom, CONTINENTS } from './countries'
import type { Continent } from './countries'
import { poolFor } from './difficulty'
import type { RoundResult, Difficulty } from './types'
import type { Achievement } from './api'

export interface LatLng { lat: number; lng: number }

export interface StreakInfo { current: number; longest: number }

interface GameContextValue {
  countryNames:           string[]
  targets:                string[]
  results:                RoundResult[] | null
  mode:                   'timed' | 'practice'
  elapsedMs:              number | null
  practiceTimeLimitMs:    number | null
  streakInfo:             StreakInfo | null
  difficulty:             Difficulty
  unlockedAchievements:   Achievement[] | null
  startGame:              () => void
  startPractice:          (timeLimitMs: number | null, continents?: readonly string[], difficulty?: Difficulty) => void
  startPracticeWithTargets: (names: string[]) => void
  setResults:             (results: RoundResult[]) => void
  setElapsedMs:           (ms: number | null) => void
  setStreakInfo:          (info: StreakInfo | null) => void
  setUnlockedAchievements: (achievements: Achievement[] | null) => void
  cameraOrientationRef:   React.MutableRefObject<LatLng | null>
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const countryNames                          = useMemo(() => poolFor('easy', CONTINENTS), [])
  const [targets, setTargets]                 = useState<string[]>([])
  const [results, setResults]                 = useState<RoundResult[] | null>(null)
  const [mode, setMode]                       = useState<'timed' | 'practice'>('timed')
  const [elapsedMs, setElapsedMs]             = useState<number | null>(null)
  const [practiceTimeLimitMs, setPracticeTimeLimitMs] = useState<number | null>(null)
  const [streakInfo, setStreakInfo]           = useState<StreakInfo | null>(null)
  const [difficulty, setDifficulty]           = useState<Difficulty>('easy')
  const [unlockedAchievements, setUnlockedAchievements] = useState<Achievement[] | null>(null)
  const cameraOrientationRef                  = useRef<LatLng | null>(null)

  const startGame = useCallback(() => {
    if (!countryNames.length) return
    setMode('timed')
    setElapsedMs(null)
    setDifficulty('easy')
    setTargets(pickRandom(countryNames, countryNames.length))
    setResults(null)
  }, [countryNames])

  const startPractice = useCallback((timeLimitMs: number | null, continents: readonly string[] = CONTINENTS, gameDifficulty: Difficulty = 'easy') => {
    const pool = poolFor(gameDifficulty, continents as Continent[])
    if (!pool.length) return
    setMode('practice')
    setElapsedMs(null)
    setPracticeTimeLimitMs(timeLimitMs)
    setDifficulty(gameDifficulty)
    setTargets(pickRandom(pool, pool.length))
    setResults(null)
  }, [])

  const startPracticeWithTargets = useCallback((names: string[]) => {
    if (!names.length) return
    setMode('practice')
    setElapsedMs(null)
    setTargets(pickRandom(names, names.length))
    setResults(null)
  }, [])

  const value = useMemo<GameContextValue>(() => ({
    countryNames, targets, results, mode, elapsedMs, practiceTimeLimitMs, streakInfo, difficulty,
    unlockedAchievements,
    startGame, startPractice, startPracticeWithTargets, setResults, setElapsedMs, setStreakInfo,
    setUnlockedAchievements,
    cameraOrientationRef,
  }), [
    countryNames, targets, results, mode, elapsedMs, practiceTimeLimitMs, streakInfo, difficulty,
    unlockedAchievements,
    startGame, startPractice, startPracticeWithTargets,
  ])

  return (
    <GameContext.Provider value={value}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside GameProvider')
  return ctx
}
