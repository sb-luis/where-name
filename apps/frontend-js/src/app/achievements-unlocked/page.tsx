'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useGame } from '@/lib/game/GameContext'
import { AchievementCelebration } from '@/components/achievements/AchievementCelebration'

export default function AchievementsUnlockedPage() {
  const router = useRouter()
  const { unlockedAchievements, setUnlockedAchievements, streakInfo } = useGame()

  useEffect(() => {
    if (!unlockedAchievements?.length) router.replace(streakInfo ? '/streak' : '/results')
  }, [unlockedAchievements, streakInfo, router])

  if (!unlockedAchievements?.length) return null

  return (
    <AchievementCelebration
      achievements={unlockedAchievements}
      onContinue={() => {
        setUnlockedAchievements(null)
        router.push(streakInfo ? '/streak' : '/results')
      }}
    />
  )
}
