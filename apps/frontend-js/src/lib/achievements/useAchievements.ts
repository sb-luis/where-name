'use client'

import { useEffect, useState } from 'react'
import { fetchAchievements } from './api'
import type { AchievementsResponse } from './types'

interface State {
  data:    AchievementsResponse | null
  loading: boolean
  error:   boolean
}

export function useAchievements(enabled = true): State {
  const [state, setState] = useState<State>({ data: null, loading: enabled, error: false })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchAchievements()
      .then(data => { if (!cancelled) setState({ data, loading: false, error: false }) })
      .catch(() => { if (!cancelled) setState({ data: null, loading: false, error: true }) })
    return () => { cancelled = true }
  }, [enabled])

  return state
}
