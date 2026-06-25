import { useMemo } from 'react'
import { useSocket } from './SocketContext'
import type { CursorData } from './types'

export function usePresence() {
  const { visitors } = useSocket()

  const cursors = useMemo<CursorData[]>(
    () =>
      visitors
        .filter(v => v.lat !== null && v.lng !== null)
        .map(v => ({ id: v.id, alias: v.alias, color: v.color, lat: v.lat!, lng: v.lng!, status: v.status })),
    [visitors],
  )

  return { visitors, cursors }
}
