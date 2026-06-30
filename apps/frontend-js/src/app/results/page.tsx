'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ResultsScreen } from '@/components/game/ResultsScreen'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { useGame } from '@/lib/game/GameContext'
import { useGeoData } from '@/lib/geo/GeoDataContext'
import { LEVELS } from '@/lib/geo/lod'
import type { GeoCollection } from '@/lib/geo/types'

export default function ResultsPage() {
  const router              = useRouter()
  const { emitStatus }      = useSocket()
  const { results, mode, elapsedMs } = useGame()
  const { loadCollection }  = useGeoData()

  const [geo, setGeo] = useState<GeoCollection | null>(null)

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

  return (
    <ResultsScreen
      results={results}
      mode={mode}
      elapsedMs={elapsedMs ?? undefined}
      geo={geo ?? undefined}
      onReturn={() => router.push('/')}
    />
  )
}
