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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

export function AchievementDetails({ achievement }: { achievement: Achievement | null }) {
  if (!achievement) return null

  const unlocked = !!achievement.unlocked_at
  const scope = achievement.continent ?? 'World'

  return (
    <div
      key={achievement.slug}
      style={{ animation: 'achievement-details-in 150ms ease-out' }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4"
    >
      <div className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center
        ${unlocked ? 'bg-gray-950' : 'bg-gray-100'}`}
      >
        <span className={`h-2.5 w-2.5 rounded-full ${unlocked ? DIFFICULTY_DOT[achievement.difficulty] : 'bg-gray-300'}`} />
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-black text-gray-900 truncate">{scope}</p>
          <span className="text-[11px] font-medium text-gray-400 uppercase tracking-widest shrink-0">
            {DIFFICULTY_LABEL[achievement.difficulty]}
          </span>
        </div>

        <p className="text-[13px] leading-snug text-gray-600">{achievement.description}</p>

        <p className="text-[11px] font-medium uppercase tracking-widest pt-0.5">
          {unlocked
            ? <span className="text-gray-400">Unlocked {formatDate(achievement.unlocked_at!)}</span>
            : <span className="text-gray-300">Still locked</span>
          }
        </p>
      </div>
    </div>
  )
}
