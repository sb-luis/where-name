'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { WelcomePage } from '@/components/multiplayer/WelcomePage'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'

export default function Page() {
  const router                                    = useRouter()
  const { self, setAlias, emitCursorMove, emitStatus } = useSocket()
  const { cursors }                               = usePresence()
  const { countryNames, startGame }               = useGame()

  useEffect(() => { emitStatus('home') }, [emitStatus])

  const handleStart = () => {
    startGame()
    router.push('/play')
  }

  return (
    <WelcomePage
      onStart={handleStart}
      loading={countryNames.length === 0}
      countryCount={countryNames.length}
      alias={self?.alias ?? null}
      onAliasSubmit={setAlias}
      cursors={cursors}
      onCursorMove={emitCursorMove}
    />
  )
}
