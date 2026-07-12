import type { AchievementsResponse } from './types'

export async function fetchAchievements(): Promise<AchievementsResponse> {
  const res = await fetch('/api/achievements')
  if (!res.ok) throw new Error('Failed to fetch achievements')
  return res.json()
}
