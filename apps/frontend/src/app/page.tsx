'use client'

import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { WelcomePage } from '@/components/multiplayer/WelcomePage'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'

function randomLatLng() {
  return {
    lat: (Math.random() - 0.5) * 140,
    lng: (Math.random() - 0.5) * 360,
  }
}

export default function Page() {
  const router                                         = useRouter()
  const { self, setAlias, emitCursorMove, emitStatus } = useSocket()
  const { cursors }                                    = usePresence()
  const { countryNames, startGame, startPractice, cameraOrientationRef } = useGame()

  useEffect(() => { emitStatus('home') }, [emitStatus])

  // Stable initial position: persisted camera orientation → self cursor → random
  const initialPosition = useMemo(() => {
    if (cameraOrientationRef.current) return cameraOrientationRef.current
    if (self?.lat != null && self?.lng != null) return { lat: self.lat, lng: self.lng }
    return randomLatLng()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleStart = () => {
    startGame()
    router.push('/play')
  }

  const handlePractice = () => {
    startPractice()
    router.push('/practice')
  }

  const handleExplore = () => {
    router.push('/explore')
  }

  const handleCameraChange = (lat: number, lng: number) => {
    cameraOrientationRef.current = { lat, lng }
  }

  return (
    <WelcomePage
      onStart={handleStart}
      onPractice={handlePractice}
      onExplore={handleExplore}
      loading={countryNames.length === 0}
      countryCount={countryNames.length}
      alias={self?.alias ?? null}
      onAliasSubmit={setAlias}
      cursors={cursors}
      initialPosition={initialPosition}
      onCursorMove={emitCursorMove}
      onCameraChange={handleCameraChange}
    />
  )
}
