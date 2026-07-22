'use client'

import { useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { globeScreenRadius, clampToGlobeEdge } from './camera'
import { CAMERA_DIST } from './lod'
import type { CursorTrackState } from './useCursorTracker'
import type { UserStatus } from '@/lib/multiplayer/types'

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
