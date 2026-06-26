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
import { LEVELS, CAMERA_DIST } from '@/lib/geo/lod'
import { C_OCEAN, C_LAND } from '@/lib/geo/palette'
import type { WorkerResponse } from '@/workers/geoBuilder.worker'
import type { CursorData, UserStatus } from '@/lib/multiplayer/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface CursorState {
  currentVec: THREE.Vector3
  targetVec:  THREE.Vector3
  color:      string
  alias:      string
  status:     UserStatus
}

// ─── Cursor visuals ───────────────────────────────────────────────────────────

function CursorArrow({ color }: { color: string }) {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" fill="none" xmlns="http://www.w3.org/2000/svg">
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

// ─── R3F scene ────────────────────────────────────────────────────────────────

interface SceneProps {
  cursorDataRef:   React.RefObject<Map<string, CursorState>>
  cursorRefsMap:   React.RefObject<Map<string, HTMLDivElement>>
  currentStatus:   UserStatus
  onCursorMove?:   (lat: number, lng: number) => void
  onCameraChange?: (lat: number, lng: number) => void
}

function PresenceScene({
  cursorDataRef,
  cursorRefsMap,
  currentStatus,
  onCursorMove,
  onCameraChange,
}: SceneProps) {
  const { scene, camera, size } = useThree()

  const mats = useMemo(() => ({
    fill: new THREE.MeshBasicMaterial({ color: C_LAND, side: THREE.DoubleSide }),
  }), [])

  const aliveRef           = useRef(true)
  const camDir             = useRef(new THREE.Vector3())
  const tempVec            = useRef(new THREE.Vector3())
  const lastCamUpdateRef   = useRef(0)
  const onCursorMoveRef    = useRef(onCursorMove)
  const onCameraChangeRef  = useRef(onCameraChange)
  onCursorMoveRef.current  = onCursorMove
  onCameraChangeRef.current = onCameraChange

  useEffect(() => {
    const worker = new Worker(new URL('../../workers/geoBuilder.worker.ts', import.meta.url))
    const fills  = new THREE.Group()

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

    worker.addEventListener('message', onMessage)
    worker.addEventListener('error', (e: ErrorEvent) => console.error('PresenceGlobe worker error', e.message))

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

  useEffect(() => () => { mats.fill.dispose() }, [mats])

  useFrame(() => {
    const pc      = camera as THREE.PerspectiveCamera
    const vfovRad = pc.fov * Math.PI / 180
    const ndcR    = 1 / (CAMERA_DIST * Math.tan(vfovRad / 2))
    const globeR  = ndcR * size.height / 2
    const cx      = size.width  / 2
    const cy      = size.height / 2

    camDir.current.copy(camera.position).normalize()

    // ── Other visitors ────────────────────────────────────────────────────────
    for (const [id, state] of cursorDataRef.current) {
      state.currentVec.lerp(state.targetVec, 0.08).normalize()
      const isVisible = state.currentVec.dot(camDir.current) > 0.02

      tempVec.current.copy(state.currentVec).project(camera)
      let sx = (tempVec.current.x + 1)  / 2 * size.width
      let sy = (-tempVec.current.y + 1) / 2 * size.height

      if (!isVisible) {
        const dx = sx - cx, dy = sy - cy
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 0) {
          const r = (globeR * 1.10) / dist
          sx = cx + dx * r; sy = cy + dy * r
        }
      }

      const el = cursorRefsMap.current.get(id)
      if (!el) continue

      el.style.transform = `translate(${sx}px, ${sy}px)`
      el.style.opacity   = state.status === currentStatus ? '1' : '0.35'
      ;(el.children[1] as HTMLElement).style.transform = 'translate(16px, -2px)'
    }

    // ── Camera orientation (throttled 200 ms) ─────────────────────────────────
    const now = performance.now()
    if (onCameraChangeRef.current && now - lastCamUpdateRef.current > 200) {
      lastCamUpdateRef.current = now
      const { lat, lon } = vec3ToLatLon(camera.position.clone().normalize())
      onCameraChangeRef.current(lat, lon)
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function latLngToCameraPos(lat: number, lng: number): [number, number, number] {
  const phi   = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  return [
    -Math.sin(phi) * Math.cos(theta) * CAMERA_DIST,
     Math.cos(phi) * CAMERA_DIST,
     Math.sin(phi) * Math.sin(theta) * CAMERA_DIST,
  ]
}

// ─── Public component ─────────────────────────────────────────────────────────

interface Props {
  cursors:          CursorData[]
  currentStatus:    UserStatus
  initialPosition?: { lat: number; lng: number }
  onCursorMove?:    (lat: number, lng: number) => void
  onCameraChange?:  (lat: number, lng: number) => void
}

export function PresenceGlobe({ cursors, currentStatus, initialPosition, onCursorMove, onCameraChange }: Props) {
  const cursorDataRef = useRef<Map<string, CursorState>>(new Map())
  const cursorRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
  const [cursorIds, setCursorIds] = useState<string[]>([])

  const cameraPosition = initialPosition
    ? latLngToCameraPos(initialPosition.lat, initialPosition.lng)
    : [CAMERA_DIST, 0, 0] as [number, number, number]

  // Sync incoming cursor data
  useEffect(() => {
    const nextIds: string[] = []
    for (const c of cursors) {
      nextIds.push(c.id)
      const target   = latLonToVec3(c.lat, c.lng, 1).normalize()
      const existing = cursorDataRef.current.get(c.id)
      if (existing) {
        existing.targetVec.copy(target)
        existing.alias  = c.alias ?? ''
        existing.status = c.status
      } else {
        cursorDataRef.current.set(c.id, {
          currentVec: target.clone(), targetVec: target.clone(),
          color: c.color, alias: c.alias ?? '', status: c.status,
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
        camera={{ fov: 44, position: cameraPosition, near: 0.1, far: 100 }}
        gl={{ antialias: true, alpha: true }}
        style={{ width: '100%', height: '100%', background: 'transparent' }}
      >
        <PresenceScene
          cursorDataRef={cursorDataRef}
          cursorRefsMap={cursorRefsMap}
          currentStatus={currentStatus}
          onCursorMove={onCursorMove}
          onCameraChange={onCameraChange}
        />
      </Canvas>

      {/* Other visitors */}
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
            style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', willChange: 'transform' }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              <CursorArrow color={state.color} />
            </div>
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              <CursorLabel alias={state.alias || '…'} color={state.color} />
            </div>
          </div>
        )
      })}

    </div>
  )
}
