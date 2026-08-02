'use client'

import { useEffect } from 'react'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { useGame } from './GameContext'
import type { UserStatus } from '@/lib/multiplayer/types'

// Shared by the play/practice/explore route pages: reports presence status,
// and persists/restores camera orientation across route changes via
// GameContext's cameraOrientationRef (survives the page unmounting, unlike
// component state).
export function useCameraPersistence(status: UserStatus) {
  const { emitStatus } = useSocket()
  const { cameraOrientationRef } = useGame()

  useEffect(() => { emitStatus(status) }, [emitStatus, status])

  // Read once on mount — cameraOrientationRef is a ref (mutating it doesn't
  // trigger re-renders), and this is meant as a one-time restore of the last
  // orientation, not something that should react to later writes.
  // eslint-disable-next-line react-hooks/refs -- deliberate one-time read, not a re-render dependency
  const initialPosition = cameraOrientationRef.current ?? undefined

  const handleCameraChange = (lat: number, lng: number) => {
    cameraOrientationRef.current = { lat, lng }
  }

  // eslint-disable-next-line react-hooks/refs 
  return { initialPosition, handleCameraChange }
}
