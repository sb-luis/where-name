'use client'

import type { Achievement } from '@/lib/achievements/types'
import type { Difficulty } from '@/lib/game/types'

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy:   'Easy',
  medium: 'Medium',
  hard:   'Hard',
}

const DIFFICULTY_DOT: Record<Difficulty, string> = {
  easy:   'bg-emerald-400',
  medium: 'bg-amber-400',
  hard:   'bg-rose-400',
}

const DIFFICULTY_RING: Record<Difficulty, string> = {
  easy:   'ring-emerald-200',
  medium: 'ring-amber-200',
  hard:   'ring-rose-200',
}

interface Props {
  achievement: Achievement
  selected: boolean
  onSelect: (achievement: Achievement) => void
}

export function AchievementBadge({ achievement, selected, onSelect }: Props) {
  const unlocked = !!achievement.unlocked_at

  return (
    <button
      type="button"
      onClick={() => onSelect(achievement)}
      aria-pressed={selected}
      className={`h-16 w-full rounded-xl border p-2.5 flex flex-col justify-between text-left transition-all duration-150
        ${unlocked ? 'bg-white border-gray-100 shadow-sm' : 'bg-black/3 border-transparent text-gray-400'}
        ${selected ? `ring-2 ${DIFFICULTY_RING[achievement.difficulty]}` : ''}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${unlocked ? DIFFICULTY_DOT[achievement.difficulty] : 'bg-gray-300'}`}
      />
      <p className={`text-[11px] font-bold leading-tight truncate ${unlocked ? 'text-gray-900' : 'text-gray-400'}`}>
        {DIFFICULTY_LABEL[achievement.difficulty]}
      </p>
    </button>
  )
}
