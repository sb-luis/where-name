'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGame } from '@/lib/game/GameContext'
import { StreakCelebration } from '@/components/streak/StreakCelebration'

export default function StreakPage() {
  const router = useRouter()
  const { streakInfo, setStreakInfo } = useGame()

  useEffect(() => {
    if (!streakInfo) router.replace('/results')
  }, [streakInfo, router])

  if (!streakInfo) return null

  return (
    <StreakCelebration
      current={streakInfo.current}
      longest={streakInfo.longest}
      onContinue={() => {
        setStreakInfo(null)
        router.push('/results')
      }}
    />
  )
}
