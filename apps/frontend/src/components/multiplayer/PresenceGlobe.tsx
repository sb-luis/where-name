'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

import { GlobeRefLines } from '@/components/globe/GlobeRefLines'
import { latLonToVec3, vec3ToLatLon } from '@/lib/geo/geometry'
import { fetchGeo } from '@/lib/geo/fetch'
import { LEVELS, CAMERA_DIST, MAX_FOV } from '@/lib/geo/lod'
import { C_OCEAN, C_LAND } from '@/lib/geo/palette'
import type { WorkerResponse } from '@/workers/geoBuilder.worker'
import type { CursorData } from '@/lib/multiplayer/types'

// ─── Cursor state (lives outside React for direct DOM updates) ────────────────

interface CursorState {
  currentVec: THREE.Vector3
  targetVec:  THREE.Vector3
  color:      string
  alias:      string
}

// ─── Cursor visuals ───────────────────────────────────────────────────────────

function CursorArrow({ color }: { color: string }) {
  return (
    <svg
      width="14"
      height="18"
      viewBox="0 0 14 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1.5 1.5 L1.5 14 L4.5 11 L7 17.5 L9 16.5 L6.5 10 L12 10 Z"
        fill={color}
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CursorLabel({ alias, color }: { alias: string; color: string }) {
  return (
    <div
      className="px-2 py-0.5 rounded-full text-white text-[11px] font-semibold whitespace-nowrap shadow-sm select-none"
      style={{ backgroundColor: color }}
    >
      {alias}
    </div>
  )
}

// ─── R3F scene (geo loading + cursor animation + pointer tracking) ────────────

interface SceneProps {
  cursorDataRef: React.RefObject<Map<string, CursorState>>
  cursorRefsMap: React.RefObject<Map<string, HTMLDivElement>>
  onCursorMove?: (lat: number, lng: number) => void
}

function PresenceScene({ cursorDataRef, cursorRefsMap, onCursorMove }: SceneProps) {
  const { scene, camera, size } = useThree()

  const mats = useMemo(() => ({
    fill: new THREE.MeshBasicMaterial({ color: C_LAND, side: THREE.DoubleSide }),
  }), [])

  const aliveRef         = useRef(true)
  const camDir           = useRef(new THREE.Vector3())
  const tempVec          = useRef(new THREE.Vector3())
  const onCursorMoveRef  = useRef(onCursorMove)
  onCursorMoveRef.current = onCursorMove

  // Geo: load LOD 0, build geometry via worker, add to scene imperatively
  useEffect(() => {
    const worker = new Worker(
      new URL('../../workers/geoBuilder.worker.ts', import.meta.url),
    )

    const fills = new THREE.Group()

    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      if (!aliveRef.current) return
      for (const feat of e.data.features) {
        for (const { positions, indices } of feat.fills) {
          const geo = new THREE.BufferGeometry()
          geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          geo.setIndex(new THREE.BufferAttribute(indices, 1))
          const mesh = new THREE.Mesh(geo, mats.fill)
          mesh.renderOrder = 1
          fills.add(mesh)
        }
      }
      scene.add(fills)
    }

    const onError = (e: ErrorEvent) => console.error('PresenceGlobe worker error', e.message)

    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', onError)

    fetchGeo(LEVELS[0].url).then(geojson => {
      if (aliveRef.current) worker.postMessage({ level: 0, geojson })
    })

    return () => {
      aliveRef.current = false
      worker.terminate()
      scene.remove(fills)
      fills.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  // Cleanup materials
  useEffect(() => {
    return () => { mats.fill.dispose() }
  }, [mats])

  // Cursor animation — runs every frame, writes directly to DOM (zero React re-renders)
  useFrame(() => {
    const pc       = camera as THREE.PerspectiveCamera
    const vfovRad  = pc.fov * Math.PI / 180
    const ndcR     = 1 / (CAMERA_DIST * Math.tan(vfovRad / 2))
    const globeR   = ndcR * size.height / 2
    const cx       = size.width  / 2
    const cy       = size.height / 2

    camDir.current.copy(camera.position).normalize()

    for (const [id, state] of cursorDataRef.current) {
      // Smooth lerp toward target
      state.currentVec.lerp(state.targetVec, 0.08).normalize()

      const isVisible = state.currentVec.dot(camDir.current) > 0.02

      // Project to screen
      tempVec.current.copy(state.currentVec).project(camera)
      let sx = (tempVec.current.x + 1)  / 2 * size.width
      let sy = (-tempVec.current.y + 1) / 2 * size.height

      // For back-hemisphere cursors, push the whole cursor just outside the globe edge
      if (!isVisible) {
        const dx   = sx - cx
        const dy   = sy - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0) {
          const r = (globeR * 1.10) / dist
          sx = cx + dx * r
          sy = cy + dy * r
        }
      }

      const el = cursorRefsMap.current.get(id)
      if (!el) continue

      // Move container to computed screen position
      el.style.transform = `translate(${sx}px, ${sy}px)`

      const arrow = el.children[0] as HTMLElement
      const label = el.children[1] as HTMLElement

      // Arrow and label stay visible and in their normal relative positions for both hemispheres
      arrow.style.opacity   = '1'
      label.style.transform = 'translate(16px, -2px)'
    }
  })

  const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
    const { lat, lon } = vec3ToLatLon(e.point.clone().normalize())
    onCursorMoveRef.current?.(lat, lon)
  }, [])

  return (
    <>
      <OrbitControls enableZoom={false} enablePan={false} enableDamping dampingFactor={0.08} />
      <mesh onPointerMove={handlePointerMove}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color={C_OCEAN} />
      </mesh>
      <GlobeRefLines />
    </>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

interface Props {
  cursors:       CursorData[]
  onCursorMove?: (lat: number, lng: number) => void
}

export function PresenceGlobe({ cursors, onCursorMove }: Props) {
  const cursorDataRef = useRef<Map<string, CursorState>>(new Map())
  const cursorRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const [cursorIds, setCursorIds] = useState<string[]>([])

  // Sync incoming cursor data to cursorDataRef (targets); React state only for join/leave
  useEffect(() => {
    const nextIds: string[] = []

    for (const c of cursors) {
      nextIds.push(c.id)
      const target = latLonToVec3(c.lat, c.lng, 1).normalize()
      const existing = cursorDataRef.current.get(c.id)

      if (existing) {
        existing.targetVec.copy(target)
        existing.alias = c.alias ?? ''
      } else {
        cursorDataRef.current.set(c.id, {
          currentVec: target.clone(),
          targetVec:  target.clone(),
          color:      c.color,
          alias:      c.alias ?? '',
        })
      }
    }

    for (const id of cursorDataRef.current.keys()) {
      if (!nextIds.includes(id)) cursorDataRef.current.delete(id)
    }

    setCursorIds(nextIds)
  }, [cursors])

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ fov: 44, position: [CAMERA_DIST, 0, 0], near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      >
        <PresenceScene
          cursorDataRef={cursorDataRef}
          cursorRefsMap={cursorRefsMap}
          onCursorMove={onCursorMove}
        />
      </Canvas>

      {/* HTML cursor overlays — positioned by useFrame, no React re-renders per frame */}
      {cursorIds.map(id => {
        const state = cursorDataRef.current.get(id)
        if (!state) return null
        return (
          <div
            key={id}
            ref={el => {
              if (el) cursorRefsMap.current.set(id, el as HTMLDivElement)
              else cursorRefsMap.current.delete(id)
            }}
            style={{
              position:       'absolute',
              top:            0,
              left:           0,
              pointerEvents:  'none',
              willChange:     'transform',
            }}
          >
            {/* Arrow — hidden on back hemisphere */}
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              <CursorArrow color={state.color} />
            </div>
            {/* Label — moves to edge when cursor is on back hemisphere */}
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              <CursorLabel alias={state.alias || '…'} color={state.color} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
