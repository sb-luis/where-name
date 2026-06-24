'use client'

import { useState, useCallback } from 'react'
import { WelcomePage } from '@/components/multiplayer/WelcomePage'
import { GameScreen } from '@/components/game/GameScreen'
import { ResultsScreen } from '@/components/game/ResultsScreen'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useCountryNames, pickRandom } from '@/lib/game/countries'
import type { GamePhase, RoundResult } from '@/lib/game/types'

export default function Page() {
  const [phase, setPhase]     = useState<GamePhase>('welcome')
  const [targets, setTargets] = useState<string[]>([])
  const [results, setResults] = useState<RoundResult[]>([])

  const { self, setAlias, emitCursorMove } = useSocket()
  const { cursors }                        = usePresence()
  const countryNames                       = useCountryNames()

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
    return (
      <WelcomePage
        onStart={startGame}
        loading={countryNames.length === 0}
        countryCount={countryNames.length}
        alias={self?.alias ?? null}
        onAliasSubmit={setAlias}
        cursors={cursors}
        onCursorMove={emitCursorMove}
      />
    )
  }

  if (phase === 'playing') {
    return <GameScreen targets={targets} onEnd={handleGameEnd} />
  }

  return <ResultsScreen results={results} onPlayAgain={startGame} />
}
