'use client'

import { useEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { GameScreen } from '@/components/game/GameScreen'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'
import { useAuth } from '@/lib/auth/AuthContext'
import type { RoundResult } from '@/lib/game/types'

const VARIANT = 'ne_110m_admin_0_countries'

async function savePracticeGame(results: RoundResult[], elapsedMs: number, completed: boolean) {
  const res = await fetch('/api/practice/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      variant: VARIANT,
      completed,
      duration_ms: elapsedMs,
      rounds: results.map((r, i) => ({
        position:    i,
        feature:     r.country,
        attempt:     1,
        outcome:     r.outcome,
        duration_ms: r.timeMs,
      })),
    }),
  })
}

export default function PracticePage() {
  const router                                = useRouter()
  const { emitCursorMove, emitStatus }        = useSocket()
  const { cursors }                           = usePresence()
  const { targets, setResults, setElapsedMs, cameraOrientationRef } = useGame()
  const { user }                              = useAuth()

  useEffect(() => { emitStatus('practice') }, [emitStatus])

  useEffect(() => {
    if (targets.length === 0) router.replace('/')
  }, [targets, router])

  const initialPosition = useMemo(() => {
    return cameraOrientationRef.current ?? undefined
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCameraChange = (lat: number, lng: number) => {
    cameraOrientationRef.current = { lat, lng }
  }

  if (targets.length === 0) return null

  return (
    <GameScreen
      practice
      targets={targets}
      cursors={cursors}
      initialPosition={initialPosition}
      onCursorMove={emitCursorMove}
      onCameraChange={handleCameraChange}
      onEnd={async (results, elapsedMs) => {
        if (results.length === 0) {
          router.push('/')
          return
        }
        const completed = results.length === targets.length
        if (user && elapsedMs != null) {
          await savePracticeGame(results, elapsedMs, completed)
        }
        flushSync(() => {
          setResults(results)
          setElapsedMs(elapsedMs ?? null)
        })
        router.push('/results')
      }}
    />
  )
}
