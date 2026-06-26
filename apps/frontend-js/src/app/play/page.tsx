'use client'

import { useEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { GameScreen } from '@/components/game/GameScreen'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'

export default function PlayPage() {
  const router                                  = useRouter()
  const { emitCursorMove, emitStatus }          = useSocket()
  const { cursors }                             = usePresence()
  const { targets, setResults, cameraOrientationRef } = useGame()

  useEffect(() => { emitStatus('playing') }, [emitStatus])

  useEffect(() => {
    if (targets.length === 0) router.replace('/')
  }, [targets, router])

  // Stable initial position from persisted camera orientation
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
      targets={targets}
      cursors={cursors}
      initialPosition={initialPosition}
      onCursorMove={emitCursorMove}
      onCameraChange={handleCameraChange}
      onEnd={(results) => {
        flushSync(() => setResults(results))
        router.push('/results')
      }}
    />
  )
}
