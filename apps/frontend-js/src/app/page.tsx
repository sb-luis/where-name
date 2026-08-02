'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { WelcomePage } from '@/components/multiplayer/WelcomePage'
import { PracticeSetupModal } from '@/components/ui/PracticeSetupModal'
import { SignUpCtaModal } from '@/components/auth/SignUpCtaModal'
import { CONTINENTS, type Continent } from '@/lib/game/countries'
import type { Difficulty } from '@/lib/game/types'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'
import { useAuth } from '@/lib/auth/AuthContext'
import { track } from '@/lib/analytics/track'
import { EVENTS } from '@/lib/analytics/events'
import { useAchievements } from '@/lib/achievements/useAchievements'
import { totalUnlocked } from '@/lib/game/difficulty'

const DEFAULT_UNLOCKS = Object.fromEntries(CONTINENTS.map(c => [c, 'easy' as Difficulty])) as Record<Continent, Difficulty>

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
  const { countryNames, startPractice, cameraOrientationRef } = useGame()
  const { user } = useAuth()
  const { data: achievementsData } = useAchievements(!!user)
  const unlockedCount = totalUnlocked(achievementsData?.unlocks ?? DEFAULT_UNLOCKS)
  const [showPracticeModal, setShowPracticeModal] = useState(false)
  const [authPrompt, setAuthPrompt] = useState<'customize' | 'explore' | null>(null)

  useEffect(() => { emitStatus('home') }, [emitStatus])

  // eslint-disable-next-line react-hooks/refs -- deliberate one-time read, not a re-render dependency
  const initialPosition = cameraOrientationRef.current ?? randomLatLng()

  if (sessionInactive) return null

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
        onPractice={handlePractice}
        onExplore={handleExplore}
        exploreLocked={!user}
        loading={countryNames.length === 0}
        countryCount={unlockedCount}
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
