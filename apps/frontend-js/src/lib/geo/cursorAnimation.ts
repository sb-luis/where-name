'use client'

import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { latLonToVec3 } from './geometry'
import { globeScreenRadius, clampToGlobeEdge } from './camera'
import { CAMERA_DIST } from './lod'
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

// Runs the per-frame cursor animation loop: lerps each cursor toward its
// target, projects it to screen space, and writes position/opacity directly
// to the DOM (bypassing React for perf — these update every frame). Called
// from inside the R3F Scene component, where useThree/useFrame are in scope.
export function useCursorFrameProjection(
  cursorDataRef: RefObject<Map<string, CursorTrackState>>,
  cursorRefsMap: RefObject<Map<string, HTMLDivElement>>,
  currentStatus: UserStatus,
) {
  const { camera, size } = useThree()
  const camDir  = useRef(new THREE.Vector3())
  const tempVec = useRef(new THREE.Vector3())

  useFrame(() => {
    const pc     = camera as THREE.PerspectiveCamera
    const globeR = globeScreenRadius(pc.fov, size.height, CAMERA_DIST)
    const cx     = size.width  / 2
    const cy     = size.height / 2

    camDir.current.copy(camera.position).normalize()

    for (const [id, state] of cursorDataRef.current) {
      state.currentVec.lerp(state.targetVec, 0.08).normalize()
      const isVisible = state.currentVec.dot(camDir.current) > 0.02

      tempVec.current.copy(state.currentVec).project(camera)
      let sx = (tempVec.current.x + 1)  / 2 * size.width
      let sy = (-tempVec.current.y + 1) / 2 * size.height

      if (!isVisible) {
        [sx, sy] = clampToGlobeEdge(sx, sy, cx, cy, globeR)
      }

      const el = cursorRefsMap.current.get(id)
      if (!el) continue

      el.style.transform = `translate(${sx}px, ${sy}px)`
      el.style.opacity   = state.status === currentStatus ? '1' : '0.35'
      ;(el.children[1] as HTMLElement).style.transform = 'translate(16px, -2px)'
    }
  })
}
