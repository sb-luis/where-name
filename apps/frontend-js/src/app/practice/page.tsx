'use client'

import { useEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { GameScreen } from '@/components/game/GameScreen'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'
import { savePracticeGame } from '@/lib/game/api'

export default function PracticePage() {
  const router                                = useRouter()
  const { emitCursorMove, emitStatus }        = useSocket()
  const { cursors }                           = usePresence()
  const { targets, setResults, setElapsedMs, setStreakInfo, cameraOrientationRef, practiceTimeLimitMs } = useGame()

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
      practiceTimeLimitMs={practiceTimeLimitMs}
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
        const saved = elapsedMs != null
          ? await savePracticeGame(results, elapsedMs, completed).catch(() => null)
          : null
        flushSync(() => {
          setResults(results)
          setElapsedMs(elapsedMs ?? null)
          if (saved?.isFirstGameToday) {
            setStreakInfo({ current: saved.currentStreak ?? 0, longest: saved.longestStreak ?? 0 })
          }
        })
        router.push(saved?.isFirstGameToday ? '/streak' : '/results')
      }}
    />
  )
}
