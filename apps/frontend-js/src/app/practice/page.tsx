'use client'

import { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { GameScreen } from '@/components/game/GameScreen'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'
import { useCameraPersistence } from '@/lib/game/useCameraPersistence'
import { savePracticeGame } from '@/lib/game/api'

export default function PracticePage() {
  const router                = useRouter()
  const { emitCursorMove }    = useSocket()
  const { cursors }           = usePresence()
  const { targets, setResults, setElapsedMs, setStreakInfo, setUnlockedAchievements, practiceTimeLimitMs, difficulty } = useGame()
  const { initialPosition, handleCameraChange } = useCameraPersistence('practice')

  useEffect(() => {
    if (targets.length === 0) router.replace('/')
  }, [targets, router])

  if (targets.length === 0) return null

  return (
    <GameScreen
      practice
      practiceTimeLimitMs={practiceTimeLimitMs}
      difficulty={difficulty}
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
          ? await savePracticeGame(results, elapsedMs, completed, difficulty).catch(() => null)
          : null
        flushSync(() => {
          setResults(results)
          setElapsedMs(elapsedMs ?? null)
          if (saved?.isFirstGameToday) {
            setStreakInfo({ current: saved.currentStreak ?? 0, longest: saved.longestStreak ?? 0 })
          }
          if (saved?.newAchievements?.length) {
            setUnlockedAchievements(saved.newAchievements)
          }
        })
        router.push(
          saved?.newAchievements?.length ? '/achievements-unlocked' :
          saved?.isFirstGameToday ? '/streak' : '/results'
        )
      }}
    />
  )
}
