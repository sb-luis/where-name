'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { GameScreen } from '@/components/game/GameScreen'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'

export default function PlayPage() {
  const router              = useRouter()
  const { emitCursorMove, emitStatus } = useSocket()
  const { cursors }         = usePresence()
  const { targets, setResults } = useGame()

  useEffect(() => { emitStatus('playing') }, [emitStatus])

  // Redirect to home if no game was started (e.g. hard refresh)
  useEffect(() => {
    if (targets.length === 0) router.replace('/')
  }, [targets, router])

  if (targets.length === 0) return null

  return (
    <GameScreen
      targets={targets}
      cursors={cursors}
      onCursorMove={emitCursorMove}
      onEnd={(results) => {
        setResults(results)
        router.push('/results')
      }}
    />
  )
}
