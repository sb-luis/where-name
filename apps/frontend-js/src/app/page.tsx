'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WelcomePage } from '@/components/multiplayer/WelcomePage'
import { PracticeSetupModal } from '@/components/ui/PracticeSetupModal'
import type { Continent } from '@/lib/game/countries'
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
  const router = useRouter()
  const { emitCursorMove, sessionInactive } = useSocket()
  const { cursors }  = usePresence()
  const { countryNames, startGame, startPractice, cameraOrientationRef } = useGame()
  const [showPracticeModal, setShowPracticeModal] = useState(false)

  const initialPosition = useMemo(() => {
    if (cameraOrientationRef.current) return cameraOrientationRef.current
    return randomLatLng()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (sessionInactive) return null

  const handleStart = () => { startGame(); router.push('/play') }
  const handlePractice = () => { setShowPracticeModal(true) }
  const handlePracticeConfirm = (timeLimitMs: number | null, continents: Continent[]) => {
    setShowPracticeModal(false)
    startPractice(timeLimitMs, continents)
    router.push('/practice')
  }
  const handleExplore = () => { router.push('/explore') }
  const handleCameraChange = (lat: number, lng: number) => {
    cameraOrientationRef.current = { lat, lng }
  }

  return (
    <>
      <WelcomePage
        onStart={handleStart}
        onPractice={handlePractice}
        onExplore={handleExplore}
        loading={countryNames.length === 0}
        countryCount={countryNames.length}
        cursors={cursors}
        initialPosition={initialPosition}
        onCursorMove={emitCursorMove}
        onCameraChange={handleCameraChange}
      />
      {showPracticeModal && (
        <PracticeSetupModal
          onConfirm={handlePracticeConfirm}
          onClose={() => setShowPracticeModal(false)}
        />
      )}
    </>
  )
}
