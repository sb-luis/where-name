import type { Achievement } from '@/lib/achievements/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const unlocked = !!achievement.unlocked_at
  return (
    <div
      className={`rounded-xl border p-3 text-center space-y-1 ${
        unlocked ? 'bg-white border-gray-100 shadow-sm' : 'bg-black/3 border-transparent opacity-50'
      }`}
    >
      <p className="text-2xl">{unlocked ? '🏆' : '🔒'}</p>
      <p className="text-xs font-bold text-gray-900 leading-tight">{achievement.name}</p>
      <p className="text-[11px] text-gray-400 leading-tight">{achievement.description}</p>
      {unlocked && achievement.unlocked_at && (
        <p className="text-[10px] font-medium text-gray-300 uppercase tracking-wide">
          {formatDate(achievement.unlocked_at)}
        </p>
      )}
    </div>
  )
}
