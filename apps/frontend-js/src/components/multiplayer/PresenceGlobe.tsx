'use client'

import {
  useEffect,
  useMemo,
  useRef,
} from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

import { GlobeRefLines } from '@/components/globe/GlobeRefLines'
import { vec3ToLatLon, latLngToCameraPos } from '@/lib/geo/geometry'
import { useCursorTracker, useCursorFrameProjection, type CursorTrackState } from '@/lib/geo/cursorAnimation'
import { fetchGeo } from '@/lib/geo/fetch'
import { LEVELS, CAMERA_DIST } from '@/lib/geo/lod'
import { C_OCEAN, C_LAND } from '@/lib/geo/palette'
import type { WorkerResponse } from '@/workers/geoBuilder.worker'
import type { CursorData, UserStatus } from '@/lib/multiplayer/types'

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
  cursorDataRef:   React.RefObject<Map<string, CursorTrackState>>
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
  const { scene, camera } = useThree()

  const mats = useMemo(() => ({
    fill: new THREE.MeshBasicMaterial({ color: C_LAND, side: THREE.DoubleSide }),
  }), [])

  const aliveRef         = useRef(true)
  const lastCamUpdateRef = useRef(0)

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

  useCursorFrameProjection(cursorDataRef, cursorRefsMap, currentStatus)

  useFrame(() => {
    // ── Camera orientation (throttled 200 ms) ─────────────────────────────────
    // Reads onCameraChange directly (not via a ref) — safe because useFrame
    // re-registers this callback fresh every render internally.
    const now = performance.now()
    if (onCameraChange && now - lastCamUpdateRef.current > 200) {
      lastCamUpdateRef.current = now
      const { lat, lon } = vec3ToLatLon(camera.position.clone().normalize())
      onCameraChange(lat, lon)
    }
  })

  // Not memoized: R3F reads event handler props fresh from the instance at
  // dispatch time (no addEventListener-style subscription to go stale), so
  // there's nothing to gain from useCallback here.
  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    const { lat, lon } = vec3ToLatLon(e.point.clone().normalize())
    onCursorMove?.(lat, lon)
  }

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
  cursors:          CursorData[]
  currentStatus:    UserStatus
  initialPosition?: { lat: number; lng: number }
  onCursorMove?:    (lat: number, lng: number) => void
  onCameraChange?:  (lat: number, lng: number) => void
}

export function PresenceGlobe({ cursors, currentStatus, initialPosition, onCursorMove, onCameraChange }: Props) {
  const { cursorDataRef, cursorRefsMap, cursorMeta } = useCursorTracker(cursors)

  const cameraPosition = initialPosition
    ? latLngToCameraPos(initialPosition.lat, initialPosition.lng, CAMERA_DIST)
    : [CAMERA_DIST, 0, 0] as [number, number, number]

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
      {cursorMeta.map(({ id, color, alias }) => (
        <div
          key={id}
          ref={el => {
            if (el) cursorRefsMap.current.set(id, el)
            else cursorRefsMap.current.delete(id)
          }}
          style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', willChange: 'transform' }}
        >
          <div style={{ position: 'absolute', top: 0, left: 0 }}>
            <CursorArrow color={color} />
          </div>
          <div style={{ position: 'absolute', top: 0, left: 0 }}>
            <CursorLabel alias={alias || '…'} color={color} />
          </div>
        </div>
      ))}

    </div>
  )
}
