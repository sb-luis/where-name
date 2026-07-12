'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Achievement } from '@/lib/game/api'

interface Props {
  achievements: Achievement[]
  onContinue:   () => void
}

export function AchievementCelebration({ achievements, onContinue }: Props) {
  const [index, setIndex] = useState(0)
  const achievement = achievements[index]
  const isLast = index === achievements.length - 1

  const handleNext = () => {
    if (isLast) { onContinue(); return }
    setIndex(i => i + 1)
  }

  return (
    <main className="h-dvh flex items-center justify-center bg-[#f3f3f3] px-4">
      <div className="w-full max-w-xs bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-5">
        <p className="text-5xl">🏆</p>
        <div>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest">
            achievement unlocked
          </p>
          <p className="text-xl font-black text-gray-900 mt-2">{achievement.name}</p>
        </div>
        <p className="text-sm text-gray-400">{achievement.description}</p>
        {achievements.length > 1 && (
          <p className="text-[11px] font-medium text-gray-300 tabular-nums">
            {index + 1} / {achievements.length}
          </p>
        )}
        <Button onClick={handleNext} className="w-full">
          {isLast ? 'continue' : 'next'}
        </Button>
      </div>
    </main>
  )
}
