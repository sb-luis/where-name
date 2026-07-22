'use client'

import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { latLonToVec3 } from './geometry'
import type { CursorData, UserStatus } from '@/lib/multiplayer/types'

// Per-frame-mutated cursor data — read/written only inside useFrame, never
// during render, so it's safe to keep off React state entirely.
export interface CursorTrackState {
  currentVec: THREE.Vector3
  targetVec:  THREE.Vector3
  status:     UserStatus
}

// The subset of cursor data that JSX actually renders (arrow/label). Derived
// straight from the `cursors` prop via useMemo — never read from a ref during
// render, so a plain array is fine, no need to sync into local state.
export interface CursorMeta {
  id:    string
  color: string
  alias: string
}

// Owns the two Maps the cursor globe overlay needs: per-frame animation
// state (ref-only) and the DOM nodes the frame loop writes positions into.
// Called from the outer (non-Canvas) component, since the DOM overlay it
// backs renders outside <Canvas> as absolutely-positioned HTML siblings.
export function useCursorTracker(cursors: CursorData[]) {
  const cursorDataRef = useRef<Map<string, CursorTrackState>>(new Map())
  const cursorRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    const nextIds = new Set(cursors.map(c => c.id))
    for (const c of cursors) {
      const target   = latLonToVec3(c.lat, c.lng, 1).normalize()
      const existing = cursorDataRef.current.get(c.id)
      if (existing) {
        existing.targetVec.copy(target)
        existing.status = c.status
      } else {
        cursorDataRef.current.set(c.id, { currentVec: target.clone(), targetVec: target.clone(), status: c.status })
      }
    }
    for (const id of cursorDataRef.current.keys()) {
      if (!nextIds.has(id)) cursorDataRef.current.delete(id)
    }
  }, [cursors])

  const cursorMeta = useMemo<CursorMeta[]>(
    () => cursors.map(c => ({ id: c.id, color: c.color, alias: c.alias ?? '' })),
    [cursors],
  )

  return { cursorDataRef, cursorRefsMap, cursorMeta }
}
