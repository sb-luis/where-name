'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ResultsScreen } from '@/components/game/ResultsScreen'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { useGame } from '@/lib/game/GameContext'

export default function ResultsPage() {
  const router           = useRouter()
  const { emitStatus }   = useSocket()
  const { results }      = useGame()

  useEffect(() => { emitStatus('playing') }, [emitStatus])

  // Redirect to home if there are no results (e.g. hard refresh)
  useEffect(() => {
    if (results.length === 0) router.replace('/')
  }, [results, router])

  if (results.length === 0) return null

  return (
    <ResultsScreen
      results={results}
      onContinue={() => router.push('/')}
    />
  )
}
