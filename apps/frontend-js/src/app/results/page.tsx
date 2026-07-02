'use client'

import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ResultsScreen } from '@/components/game/ResultsScreen'
import { Modal } from '@/components/ui/Modal'
import { AuthForm } from '@/components/auth/AuthForm'
import { StatCards } from '@/components/stats/StatCards'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { useGame } from '@/lib/game/GameContext'
import { useGeoData } from '@/lib/geo/GeoDataContext'
import { useAuth } from '@/lib/auth/AuthContext'
import { savePracticeGame } from '@/lib/game/api'
import { LEVELS } from '@/lib/geo/lod'
import type { GeoCollection } from '@/lib/geo/types'

export default function ResultsPage() {
  const router              = useRouter()
  const { emitStatus }      = useSocket()
  const { results, mode, elapsedMs, targets, startPracticeWithTargets } = useGame()
  const { loadCollection }  = useGeoData()
  const { user, loading: authLoading } = useAuth()

  const [geo, setGeo]     = useState<GeoCollection | null>(null)
  const [decided, setDecided] = useState(false)

  useEffect(() => { emitStatus('results') }, [emitStatus])

  useEffect(() => {
    if (results === null) router.replace('/')
  }, [results, router])

  // Fetch geo for the current-game map
  useEffect(() => {
    if (mode !== 'practice') return
    loadCollection(LEVELS[0].url).then(setGeo).catch(() => {})
  }, [mode, loadCollection])

  if (results === null) return null

  const gate = mode === 'practice' && !authLoading && !user && results.length > 0 && !decided
  const correct = results.filter(r => r.outcome === 'correct').length
  const wrong   = results.filter(r => r.outcome === 'wrong').length
  const skipped = results.filter(r => r.outcome === 'skipped').length

  return (
    <>
      <div className={gate ? 'blur-md pointer-events-none select-none' : undefined}>
        <ResultsScreen
          results={results}
          mode={mode}
          elapsedMs={elapsedMs ?? undefined}
          geo={geo ?? undefined}
          onReturn={() => router.push('/')}
          onRetryFailed={(countries) => {
            flushSync(() => { startPracticeWithTargets(countries) })
            router.push('/practice')
          }}
        />
      </div>
      {gate && (
        <Modal className="p-8 w-full mx-5 max-w-lg space-y-5" onClose={() => setDecided(true)} closeOnBackdropClick={false}>
          <div className="px-5">
          <StatCards stats={[
            { label: 'correct', value: correct },
            { label: 'wrong',   value: wrong },
            { label: 'skipped', value: skipped },
          ]} />
          </div>

          <h2 className="text-5xl italic font-bold text-center text-gray-900">
            keep your progress, enjoy all features!
          </h2>

          <hr className='text-gray-200 pb-5'></hr>

          <AuthForm
            defaultTab="register"
            className="px-10 md:px-20 space-y-3"
            onSuccess={() => {
              if (elapsedMs != null) {
                const completed = results.length === targets.length
                savePracticeGame(results, elapsedMs, completed).catch(() => {})
              }
              setDecided(true)
            }}
          />
        </Modal>
      )}
    </>
  )
}
