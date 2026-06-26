'use client'

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

import { GlobeRefLines } from '@/components/globe/GlobeRefLines'
import { latLonToVec3, vec3ToLatLon } from '@/lib/geo/geometry'
import { pickCountry } from '@/lib/geo/hit-test'
import { fetchGeo } from '@/lib/geo/fetch'
import { LEVELS, lodForFov, clamp, CAMERA_DIST, MIN_FOV, MAX_FOV, fovToSlider, sliderToFov } from '@/lib/geo/lod'
import { C_OCEAN, C_LAND, C_BORDER, C_SELECTED } from '@/lib/geo/palette'
import type { GeoCollection } from '@/lib/geo/types'
import type { WorkerResponse } from '@/workers/geoBuilder.worker'
import type { CursorData, UserStatus } from '@/lib/multiplayer/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface LodData {
  borders: THREE.Group
  fills:   THREE.Group
  fillMap: Map<string, THREE.Group>
}

interface CursorState {
  currentVec: THREE.Vector3
  targetVec:  THREE.Vector3
  color:      string
  alias:      string
  status:     UserStatus
}

function applyMat(group: THREE.Group, mat: THREE.Material) {
  for (const child of group.children) (child as THREE.Mesh).material = mat
}

// ── Scene handle ───────────────────────────────────────────────────────────────

interface SceneHandle {
  setFov: (fov: number) => void
  reset:  () => void
}

// ── Scene ─────────────────────────────────────────────────────────────────────

interface SceneProps {
  onFovChange?:    (fov: number) => void
  onCursorMove?:   (lat: number, lng: number) => void
  onCameraChange?: (lat: number, lng: number) => void
  onHover?:        (name: string | null) => void
  cursorDataRef:   React.RefObject<Map<string, CursorState>>
  cursorRefsMap:   React.RefObject<Map<string, HTMLDivElement>>
  currentStatus:   UserStatus
}

const ExploreScene = forwardRef<SceneHandle, SceneProps>(
  function ExploreScene(
    { onFovChange, onCursorMove, onCameraChange, onHover, cursorDataRef, cursorRefsMap, currentStatus },
    ref,
  ) {
    const { scene, camera, gl } = useThree()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controlsRef = useRef<any>(null)

    const mat = useMemo(() => ({
      fill:   new THREE.MeshBasicMaterial({ color: C_LAND,     side: THREE.DoubleSide }),
      hover:  new THREE.MeshBasicMaterial({ color: C_SELECTED, side: THREE.DoubleSide }),
      border: new THREE.LineBasicMaterial({ color: C_BORDER,   depthTest: true, depthWrite: false }),
    }), [])

    const workerRef       = useRef<Worker | null>(null)
    const lodDataRef      = useRef<(LodData | null)[]>([null, null, null])
    const geojsonsRef     = useRef<(GeoCollection | null)[]>([null, null, null])
    const loadedRef       = useRef<boolean[]>([false, false, false])
    const buildPromiseRef = useRef<(Promise<void> | null)[]>([null, null, null])
    const activeLodRef    = useRef(-1)
    const currentLevelRef = useRef(-1)
    const hoveredNameRef  = useRef<string | null>(null)
    const hoveredGroupRef = useRef<THREE.Group | null>(null)
    const fovRef          = useRef(MAX_FOV)
    const aliveRef        = useRef(true)
    const flyRafRef       = useRef<number | null>(null)
    const lastHitRef      = useRef(0)
    const lastCamRef      = useRef(0)

    const onFovChangeRef    = useRef(onFovChange)
    const onCursorMoveRef   = useRef(onCursorMove)
    const onCameraChangeRef = useRef(onCameraChange)
    const onHoverRef        = useRef(onHover)
    onFovChangeRef.current    = onFovChange
    onCursorMoveRef.current   = onCursorMove
    onCameraChangeRef.current = onCameraChange
    onHoverRef.current        = onHover

    const pc = camera as THREE.PerspectiveCamera

    // Select a country by name — no-ops if already selected or name is null
    const selectCountry = useCallback((name: string | null) => {
      if (!name || name === hoveredNameRef.current) return
      if (hoveredGroupRef.current) applyMat(hoveredGroupRef.current, mat.fill)
      hoveredNameRef.current = name
      const lod = lodDataRef.current[activeLodRef.current]
      const g   = lod?.fillMap.get(name) ?? null
      hoveredGroupRef.current = g
      if (g) applyMat(g, mat.hover)
      onHoverRef.current?.(name)
    }, [mat])

    const applyLod = useCallback((level: number) => {
      const data = lodDataRef.current[level]
      if (!data) return
      for (let i = 0; i < 3; i++) {
        if (i === level) continue
        const d = lodDataRef.current[i]
        if (d) { d.borders.visible = false; d.fills.visible = false }
      }
      // Re-apply hover on the new LOD's fill map
      if (hoveredNameRef.current) {
        if (hoveredGroupRef.current) applyMat(hoveredGroupRef.current, mat.fill)
        const g = data.fillMap.get(hoveredNameRef.current) ?? null
        hoveredGroupRef.current = g
        if (g) applyMat(g, mat.hover)
      }
      activeLodRef.current = level
      data.borders.visible = true
      data.fills.visible   = true
    }, [mat])

    const loadLod = useCallback((level: number): Promise<void> => {
      if (loadedRef.current[level]) return Promise.resolve()
      if (buildPromiseRef.current[level]) return buildPromiseRef.current[level]!

      buildPromiseRef.current[level] = (async () => {
        const worker = workerRef.current
        if (!worker) return

        const geojson = await fetchGeo(LEVELS[level].url)
        if (!aliveRef.current) return

        const response = await new Promise<WorkerResponse>((resolve, reject) => {
          const onMsg = (e: MessageEvent<WorkerResponse>) => {
            if (e.data.level !== level) return
            cleanup(); resolve(e.data)
          }
          const onErr = (e: ErrorEvent) => { cleanup(); reject(new Error(e.message)) }
          const cleanup = () => {
            worker.removeEventListener('message', onMsg)
            worker.removeEventListener('error', onErr)
          }
          worker.addEventListener('message', onMsg)
          worker.addEventListener('error', onErr)
          worker.postMessage({ level, geojson })
        })

        if (!aliveRef.current) return

        const borders = new THREE.Group()
        const fills   = new THREE.Group()
        const fillMap = new Map<string, THREE.Group>()

        for (const feat of response.features) {
          const featureGroup = new THREE.Group()
          for (const { positions, indices } of feat.fills) {
            const geo = new THREE.BufferGeometry()
            geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
            geo.setIndex(new THREE.BufferAttribute(indices, 1))
            const mesh = new THREE.Mesh(geo, mat.fill)
            mesh.renderOrder = 1
            featureGroup.add(mesh)
          }
          fills.add(featureGroup)
          fillMap.set(feat.name, featureGroup)

          for (const bp of feat.borders) {
            const geo = new THREE.BufferGeometry()
            geo.setAttribute('position', new THREE.BufferAttribute(bp, 3))
            const line = new THREE.Line(geo, mat.border)
            line.renderOrder = 999
            borders.add(line)
          }
        }

        borders.visible = false
        fills.visible   = false
        scene.add(borders)
        scene.add(fills)
        geojsonsRef.current[level] = geojson
        lodDataRef.current[level]  = { borders, fills, fillMap }
        loadedRef.current[level]   = true

        if (lodForFov(fovRef.current) === level) applyLod(level)
      })()

      return buildPromiseRef.current[level]!
    }, [scene, mat, applyLod])

    const setFov = useCallback((fov: number) => {
      const f = clamp(fov, MIN_FOV, MAX_FOV)
      fovRef.current = f
      pc.fov = f
      pc.updateProjectionMatrix()

      const zoom = 60 / f
      if (controlsRef.current) {
        controlsRef.current.rotateSpeed   = 0.95 / Math.pow(zoom + 0.5, 1.15)
        controlsRef.current.dampingFactor = 0.1 + Math.min(zoom / 200, 1) * 0.4
      }

      onFovChangeRef.current?.(f)

      const level = lodForFov(f)
      if (level !== currentLevelRef.current) {
        currentLevelRef.current = level
        loadedRef.current[level] ? applyLod(level) : loadLod(level)
      }
    }, [pc, applyLod, loadLod])

    const zoomByRatio = useCallback((r: number) => { setFov(fovRef.current * r) }, [setFov])

    const animateTo = useCallback((targetDir: THREE.Vector3, targetFov: number) => {
      if (flyRafRef.current !== null) { cancelAnimationFrame(flyRafRef.current); flyRafRef.current = null }
      const startPos = pc.position.clone()
      const startFov = fovRef.current
      const start    = performance.now()
      if (controlsRef.current) controlsRef.current.enabled = false

      const tick = () => {
        const raw = Math.min((performance.now() - start) / 1200, 1)
        const t   = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2
        pc.position.copy(startPos.clone().normalize().lerp(targetDir, t).normalize().multiplyScalar(CAMERA_DIST))
        pc.lookAt(0, 0, 0)
        setFov(clamp(startFov + (targetFov - startFov) * t, MIN_FOV, MAX_FOV))
        if (raw < 1) {
          flyRafRef.current = requestAnimationFrame(tick)
        } else {
          flyRafRef.current = null
          if (controlsRef.current) { controlsRef.current.enabled = true; controlsRef.current.update() }
        }
      }
      flyRafRef.current = requestAnimationFrame(tick)
    }, [pc, setFov])

    useImperativeHandle(ref, () => ({
      setFov,
      reset: () => animateTo(new THREE.Vector3(1, 0, 0), MAX_FOV),
    }), [setFov, animateTo])

    // Worker
    useEffect(() => {
      const w = new Worker(new URL('../../workers/geoBuilder.worker.ts', import.meta.url))
      workerRef.current = w
      return () => { w.terminate(); workerRef.current = null }
    }, [])

    // Wheel zoom
    useEffect(() => {
      const canvas = gl.domElement
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        zoomByRatio(Math.exp(e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 600 : 1) * 0.0008))
      }
      canvas.addEventListener('wheel', onWheel, { passive: false })
      return () => canvas.removeEventListener('wheel', onWheel)
    }, [gl, zoomByRatio])

    // Pinch zoom
    useEffect(() => {
      const canvas = gl.domElement
      let prev = 0
      const d = (t: TouchList) => t.length < 2 ? 0 : Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
      const onStart = (e: TouchEvent) => { if (e.touches.length === 2) prev = d(e.touches) }
      const onMove  = (e: TouchEvent) => {
        if (e.touches.length !== 2) return
        e.preventDefault()
        const cur = d(e.touches)
        if (prev > 0) zoomByRatio(prev / cur)
        prev = cur
      }
      const onEnd = () => { prev = 0 }
      canvas.addEventListener('touchstart', onStart, { passive: true })
      canvas.addEventListener('touchmove', onMove, { passive: false })
      canvas.addEventListener('touchend', onEnd, { passive: true })
      return () => {
        canvas.removeEventListener('touchstart', onStart)
        canvas.removeEventListener('touchmove', onMove)
        canvas.removeEventListener('touchend', onEnd)
      }
    }, [gl, zoomByRatio])

    // Bootstrap: load LODs, then pick a random starting country
    useEffect(() => {
      setFov(MAX_FOV)
      const preload = async () => {
        await loadLod(0)
        if (!aliveRef.current) return

        // Orient camera to a random country and pre-select it
        const geojson = geojsonsRef.current[0]
        const lod     = lodDataRef.current[0]
        if (geojson && lod) {
          const valid = geojson.features.filter(f => {
            const n = String(f.properties?.NAME ?? f.properties?.ADMIN ?? '')
            return n && n !== 'Unknown'
          })
          const feat = valid[Math.floor(Math.random() * valid.length)]
          if (feat) {
            const name = String(feat.properties?.NAME ?? feat.properties?.ADMIN ?? '')
            const polys = feat.geometry.type === 'Polygon'
              ? [feat.geometry.coordinates as number[][][]]
              : feat.geometry.coordinates as number[][][][]
            let ring = polys[0][0]
            for (const poly of polys) { if (poly[0].length > ring.length) ring = poly[0] }
            let sumLon = 0, sumLat = 0
            for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat }
            const dir = latLonToVec3(sumLat / ring.length, sumLon / ring.length, 1).normalize()

            pc.position.copy(dir.multiplyScalar(CAMERA_DIST))
            pc.lookAt(0, 0, 0)
            controlsRef.current?.update()

            hoveredNameRef.current = name
            const g = lod.fillMap.get(name) ?? null
            hoveredGroupRef.current = g
            if (g) applyMat(g, mat.hover)
            onHoverRef.current?.(name)
          }
        }

        await loadLod(1)
        if (!aliveRef.current) return
        await loadLod(2)
      }
      preload()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => () => { aliveRef.current = false }, [])

    // Geometry cleanup
    useEffect(() => () => {
      for (const data of lodDataRef.current) {
        if (!data) continue
        scene.remove(data.borders)
        scene.remove(data.fills)
        data.borders.traverse(o => { if (o instanceof THREE.Line) o.geometry.dispose() })
        data.fills.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
      }
      mat.fill.dispose()
      mat.hover.dispose()
      mat.border.dispose()
    }, [scene, mat])

    // Frame loop: animate cursors + throttled camera callback
    const camDir  = useRef(new THREE.Vector3())
    const tempVec = useRef(new THREE.Vector3())

    useFrame(({ size }) => {
      camDir.current.copy(camera.position).normalize()

      const pc_ = camera as THREE.PerspectiveCamera
      const vfovRad = pc_.fov * Math.PI / 180
      const ndcR    = 1 / (CAMERA_DIST * Math.tan(vfovRad / 2))
      const globeR  = ndcR * size.height / 2
      const cx = size.width / 2
      const cy = size.height / 2

      for (const [id, state] of cursorDataRef.current) {
        state.currentVec.lerp(state.targetVec, 0.08).normalize()
        const facing = state.currentVec.dot(camDir.current) > 0.02

        tempVec.current.copy(state.currentVec).project(camera)
        let sx = (tempVec.current.x + 1) / 2 * size.width
        let sy = (-tempVec.current.y + 1) / 2 * size.height

        if (!facing) {
          const dx = sx - cx, dy = sy - cy
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 0) { sx = cx + dx * (globeR * 1.1) / dist; sy = cy + dy * (globeR * 1.1) / dist }
        }

        const el = cursorRefsMap.current?.get(id)
        if (el) {
          el.style.transform = `translate(${sx}px, ${sy}px)`
          el.style.opacity = state.status === currentStatus ? '1' : '0.35'
        }
      }

      // Throttled camera orientation callback
      const now = performance.now()
      if (onCameraChangeRef.current && now - lastCamRef.current > 200) {
        lastCamRef.current = now
        const { lat, lon } = vec3ToLatLon(camera.position.clone().normalize())
        onCameraChangeRef.current(lat, lon)
      }
    })

    const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
      const { lat, lon } = vec3ToLatLon(e.point.clone().normalize())
      onCursorMoveRef.current?.(lat, lon)
      // Throttle hit-test to ~30fps
      const now = performance.now()
      if (now - lastHitRef.current < 32) return
      lastHitRef.current = now
      selectCountry(pickCountry(lon, lat, geojsonsRef.current[activeLodRef.current]?.features ?? []))
    }, [selectCountry])

    // onClick handles mobile taps (browser suppresses it after a drag, so no conflict with rotation)
    const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
      const { lat, lon } = vec3ToLatLon(e.point.clone().normalize())
      selectCountry(pickCountry(lon, lat, geojsonsRef.current[activeLodRef.current]?.features ?? []))
    }, [selectCountry])

    return (
      <>
        <color attach="background" args={['#f3f3f3']} />
        <OrbitControls
          ref={controlsRef}
          enableDamping
          enableZoom={false}
          enablePan={false}
          minDistance={CAMERA_DIST}
          maxDistance={CAMERA_DIST}
        />
        <mesh onPointerMove={handlePointerMove} onClick={handleClick}>
          <sphereGeometry args={[1, 64, 64]} />
          <meshBasicMaterial color={C_OCEAN} />
        </mesh>
        <GlobeRefLines />
      </>
    )
  },
)

// ── Cursor visuals ─────────────────────────────────────────────────────────────

function CursorArrow({ color }: { color: string }) {
  return (
    <svg width="14" height="18" viewBox="0 0 14 18" fill="none">
      <path
        d="M1.5 1.5 L1.5 14 L4.5 11 L7 17.5 L9 16.5 L6.5 10 L12 10 Z"
        fill={color} stroke="white" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"
      />
    </svg>
  )
}

// ── Public component ───────────────────────────────────────────────────────────

export interface ExploreGlobeHandle {
  reset: () => void
}

interface Props {
  cursors?:         CursorData[]
  currentStatus:    UserStatus
  initialPosition?: { lat: number; lng: number }
  onCursorMove?:    (lat: number, lng: number) => void
  onCameraChange?:  (lat: number, lng: number) => void
  onHover?:         (name: string | null) => void
}

export const ExploreGlobe = forwardRef<ExploreGlobeHandle, Props>(function ExploreGlobe(
  { cursors = [], currentStatus, initialPosition, onCursorMove, onCameraChange, onHover },
  ref,
) {
  const [sliderValue, setSliderValue] = useState(() => fovToSlider(MAX_FOV))
  const [cursorIds, setCursorIds]     = useState<string[]>([])

  const sceneRef      = useRef<SceneHandle>(null)
  const cursorDataRef = useRef<Map<string, CursorState>>(new Map())
  const cursorRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())

  useImperativeHandle(ref, () => ({
    reset: () => sceneRef.current?.reset(),
  }), [])

  const handleFovChange = useCallback((fov: number) => {
    setSliderValue(fovToSlider(fov))
  }, [])

  const handleSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    setSliderValue(v)
    sceneRef.current?.setFov(sliderToFov(v))
  }, [])

  // Sync cursor data from props into the ref map (read by useFrame each tick)
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
          currentVec: target.clone(),
          targetVec:  target.clone(),
          color:      c.color,
          alias:      c.alias ?? '',
          status:     c.status,
        })
      }
    }
    for (const id of cursorDataRef.current.keys()) {
      if (!nextIds.includes(id)) cursorDataRef.current.delete(id)
    }
    setCursorIds(nextIds)
  }, [cursors])

  const cameraPosition = useMemo<[number, number, number]>(() => {
    if (!initialPosition) return [CAMERA_DIST, 0, 0]
    const phi   = (90 - initialPosition.lat) * (Math.PI / 180)
    const theta = (initialPosition.lng + 180) * (Math.PI / 180)
    return [
      -Math.sin(phi) * Math.cos(theta) * CAMERA_DIST,
       Math.cos(phi) * CAMERA_DIST,
       Math.sin(phi) * Math.sin(theta) * CAMERA_DIST,
    ]
  }, [initialPosition])

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ fov: MAX_FOV, position: cameraPosition, near: 0.1, far: 100 }}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <ExploreScene
          ref={sceneRef}
          onFovChange={handleFovChange}
          onCursorMove={onCursorMove}
          onCameraChange={onCameraChange}
          onHover={onHover}
          cursorDataRef={cursorDataRef}
          cursorRefsMap={cursorRefsMap}
          currentStatus={currentStatus}
        />
      </Canvas>

      {/* Zoom slider */}
      <div className="globe-zoom-slider-wrap">
        <span className="globe-zoom-label">−</span>
        <input
          className="globe-zoom-slider"
          type="range" min="0" max="1" step="0.001"
          value={sliderValue}
          onChange={handleSlider}
        />
        <span className="globe-zoom-label">+</span>
      </div>

      {/* Cursor overlays */}
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
            <div
              className="absolute px-2 py-0.5 rounded-full text-white text-[11px] font-semibold whitespace-nowrap shadow-sm select-none"
              style={{ top: 0, left: 16, backgroundColor: state.color }}
            >
              {state.alias || '…'}
            </div>
          </div>
        )
      })}

    </div>
  )
})
