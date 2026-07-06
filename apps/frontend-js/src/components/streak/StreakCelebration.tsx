'use client'

import { useEffect, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { Button } from '@/components/ui/Button'

interface Props {
  current:    number
  longest:    number
  onContinue: () => void
}

export function StreakCelebration({ current, longest, onContinue }: Props) {
  const [displayed, setDisplayed] = useState(Math.max(current - 1, 0))

  useEffect(() => {
    const t = setTimeout(() => setDisplayed(current), 150)
    return () => clearTimeout(t)
  }, [current])

  const isNewStreak     = current <= 1
  const isPersonalBest  = !isNewStreak && current >= longest

  const headline = isPersonalBest ? 'new personal best!' : isNewStreak ? 'streak started!' : 'streak alive!'
  const subline  = isNewStreak ? 'come back tomorrow to keep it going' : 'keep it up'

  return (
    <main className="h-dvh flex items-center justify-center bg-[#f3f3f3] px-4">
      <div className="w-full max-w-xs bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center space-y-5">
        <p className="text-5xl">🔥</p>
        <div>
          <p className="text-6xl font-black text-gray-900 tabular-nums">
            <NumberFlow value={displayed} />
          </p>
          <p className="text-[11px] font-medium text-gray-400 uppercase tracking-widest mt-1">
            day streak
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-lg font-bold text-gray-900">{headline}</p>
          <p className="text-sm text-gray-400">{subline}</p>
        </div>
        <Button onClick={onContinue} className="w-full">
          continue
        </Button>
      </div>
    </main>
  )
}
