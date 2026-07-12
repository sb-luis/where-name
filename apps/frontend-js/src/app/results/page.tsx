'use client'

import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useRouter } from 'next/navigation'
import { ResultsScreen } from '@/components/game/ResultsScreen'
import { SignUpCtaModal } from '@/components/auth/SignUpCtaModal'
import { StatCards } from '@/components/stats/StatCards'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { useGame } from '@/lib/game/GameContext'
import { useGeoData } from '@/lib/geo/GeoDataContext'
import { useAuth } from '@/lib/auth/AuthContext'
import { savePracticeGame } from '@/lib/game/api'
import { track } from '@/lib/analytics/track'
import { EVENTS } from '@/lib/analytics/events'
import { LEVELS } from '@/lib/geo/lod'
import type { GeoCollection } from '@/lib/geo/types'

export default function ResultsPage() {
  const router              = useRouter()
  const { emitStatus }      = useSocket()
  const { results, mode, elapsedMs, targets, practiceTimeLimitMs, difficulty, startPracticeWithTargets } = useGame()
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
            track(EVENTS.PRACTICE_STARTED, {
              source: 'redemption',
              time_limit_ms: practiceTimeLimitMs,
              target_count: countries.length,
              authenticated: !!user,
            })
            flushSync(() => { startPracticeWithTargets(countries) })
            router.push('/practice')
          }}
        />
      </div>
      {gate && (
        <SignUpCtaModal
          analyticsContext="practice_results"
          message="keep your progress ⛺️"
          onClose={() => setDecided(true)}
          onSuccess={() => {
            if (elapsedMs != null) {
              const completed = results.length === targets.length
              // practice_completed was already reported (server side)
              // this call is just persisting data, now that they've signed up.
              savePracticeGame(results, elapsedMs, completed, difficulty, { skipAnalytics: true }).catch(() => {})
            }
          }}
        >
          <div className="px-5">
            <StatCards stats={[
              { label: 'correct', value: correct },
              { label: 'wrong',   value: wrong },
              { label: 'skipped', value: skipped },
            ]} />
          </div>
        </SignUpCtaModal>
      )}
    </>
  )
}
