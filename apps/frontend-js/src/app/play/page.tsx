'use client'

import { useEffect } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { GameScreen } from '@/components/game/GameScreen'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'
import { useCameraPersistence } from '@/lib/game/useCameraPersistence'

export default function PlayPage() {
  const router               = useRouter()
  const { emitCursorMove }   = useSocket()
  const { cursors }          = usePresence()
  const { targets, setResults } = useGame()
  const { initialPosition, handleCameraChange } = useCameraPersistence('playing')

  useEffect(() => {
    if (targets.length === 0) router.replace('/')
  }, [targets, router])

  if (targets.length === 0) return null

  return (
    <GameScreen
      targets={targets}
      cursors={cursors}
      initialPosition={initialPosition}
      onCursorMove={emitCursorMove}
      onCameraChange={handleCameraChange}
      onQuit={() => router.replace('/')}
      onEnd={(results) => {
        flushSync(() => setResults(results))
        router.push('/results')
      }}
    />
  )
}
