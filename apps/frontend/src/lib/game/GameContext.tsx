'use client'

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { useCountryNames, pickRandom } from './countries'
import type { RoundResult } from './types'

interface GameContextValue {
  countryNames: string[]
  targets: string[]
  results: RoundResult[]
  startGame: () => void
  setResults: (results: RoundResult[]) => void
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: ReactNode }) {
  const countryNames          = useCountryNames()
  const [targets, setTargets] = useState<string[]>([])
  const [results, setResults] = useState<RoundResult[]>([])

  const startGame = useCallback(() => {
    if (!countryNames.length) return
    setTargets(pickRandom(countryNames, countryNames.length))
    setResults([])
  }, [countryNames])

  return (
    <GameContext.Provider value={{ countryNames, targets, results, startGame, setResults }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be used inside GameProvider')
  return ctx
}
