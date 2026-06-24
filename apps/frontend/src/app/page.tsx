'use client'

import { useState, useCallback } from 'react'
import { WelcomeScreen } from '@/components/game/WelcomeScreen'
import { GameScreen } from '@/components/game/GameScreen'
import { ResultsScreen } from '@/components/game/ResultsScreen'
import { useCountryNames, pickRandom } from '@/lib/game/countries'
import type { GamePhase, RoundResult } from '@/lib/game/types'

export default function Page() {
  const [phase, setPhase] = useState<GamePhase>('welcome')
  const [targets, setTargets] = useState<string[]>([])
  const [results, setResults] = useState<RoundResult[]>([])

  const countryNames = useCountryNames()

  // Shuffle all countries — GameScreen consumes them as a queue until time runs out.
  const startGame = useCallback(() => {
    if (!countryNames.length) return
    setTargets(pickRandom(countryNames, countryNames.length))
    setResults([])
    setPhase('playing')
  }, [countryNames])

  const handleGameEnd = useCallback((r: RoundResult[]) => {
    setResults(r)
    setPhase('results')
  }, [])

  if (phase === 'welcome') {
    return <WelcomeScreen onStart={startGame} loading={countryNames.length === 0} countryCount={countryNames.length} />
  }
  if (phase === 'playing') {
    return <GameScreen targets={targets} onEnd={handleGameEnd} />
  }
  return <ResultsScreen results={results} onPlayAgain={startGame} />
}
