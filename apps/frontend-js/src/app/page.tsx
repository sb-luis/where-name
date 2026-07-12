'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WelcomePage } from '@/components/multiplayer/WelcomePage'
import { PracticeSetupModal } from '@/components/ui/PracticeSetupModal'
import { SignUpCtaModal } from '@/components/auth/SignUpCtaModal'
import type { Continent } from '@/lib/game/countries'
import type { Difficulty } from '@/lib/game/types'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'
import { useAuth } from '@/lib/auth/AuthContext'
import { track } from '@/lib/analytics/track'
import { EVENTS } from '@/lib/analytics/events'

function randomLatLng() {
  return {
    lat: (Math.random() - 0.5) * 140,
    lng: (Math.random() - 0.5) * 360,
  }
}

export default function Page() {
  const router = useRouter()
  const { emitCursorMove, emitStatus, sessionInactive } = useSocket()
  const { cursors }  = usePresence()
  const { countryNames, startGame, startPractice, cameraOrientationRef } = useGame()
  const { user } = useAuth()
  const [showPracticeModal, setShowPracticeModal] = useState(false)
  const [authPrompt, setAuthPrompt] = useState<'customize' | 'explore' | null>(null)

  useEffect(() => { emitStatus('home') }, [emitStatus])

  const initialPosition = useMemo(() => {
    if (cameraOrientationRef.current) return cameraOrientationRef.current
    return randomLatLng()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (sessionInactive) return null

  const handleStart = () => { startGame(); router.push('/play') }
  const handlePractice = () => { setShowPracticeModal(true) }
  const handlePracticeConfirm = (timeLimitMs: number | null, continents: Continent[], difficulty: Difficulty) => {
    setShowPracticeModal(false)
    track(EVENTS.PRACTICE_STARTED, {
      source: 'setup',
      time_limit_ms: timeLimitMs,
      continents,
      difficulty,
      authenticated: !!user,
    })
    startPractice(timeLimitMs, continents, difficulty)
    router.push('/practice')
  }
  const handleExplore = () => {
    if (!user) { setAuthPrompt('explore'); return }
    router.push('/explore')
  }
  const handleCameraChange = (lat: number, lng: number) => {
    cameraOrientationRef.current = { lat, lng }
  }

  return (
    <>
      <WelcomePage
        onStart={handleStart}
        onPractice={handlePractice}
        onExplore={handleExplore}
        exploreLocked={!user}
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
          onSignUp={() => setAuthPrompt('customize')}
        />
      )}
      {authPrompt && (
        <SignUpCtaModal
          analyticsContext={authPrompt === 'explore' ? 'explore' : 'customize_practice'}
          message={authPrompt === 'explore' ? 'explore the world 🗺️' : 'control your practice 🏔️️'}
          onClose={() => setAuthPrompt(null)}
          onSuccess={() => { if (authPrompt === 'explore') router.push('/explore') }}
        />
      )}
    </>
  )
}
