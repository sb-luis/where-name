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
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

import { GlobeRefLines } from '@/components/globe/GlobeRefLines'
import { latLonToVec3, vec3ToLatLon, latLngToCameraPos } from '@/lib/geo/geometry'
import { easeInOutCubic, orbitControlsTuning } from '@/lib/geo/camera'
import { useCursorTracker, type CursorTrackState } from '@/lib/geo/useCursorTracker'
import { useCursorFrameProjection } from '@/lib/geo/useCursorFrameProjection'
import { useLodLoader } from '@/lib/geo/useLodLoader'
import { pickCountry } from '@/lib/geo/hit-test'
import { lodForFov, clamp, CAMERA_DIST, MIN_FOV, MAX_FOV, fovToSlider, sliderToFov } from '@/lib/geo/lod'
import { C_OCEAN, C_LAND, C_BORDER, C_SELECTED } from '@/lib/geo/palette'
import { useLatestRef } from '@/lib/useLatestRef'
import type { CursorData, UserStatus } from '@/lib/multiplayer/types'

// ── Types ─────────────────────────────────────────────────────────────────────

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
  cursorDataRef:   React.RefObject<Map<string, CursorTrackState>>
  cursorRefsMap:   React.RefObject<Map<string, HTMLDivElement>>
  currentStatus:   UserStatus
}

const ExploreScene = forwardRef<SceneHandle, SceneProps>(
  function ExploreScene(
    { onFovChange, onCursorMove, onCameraChange, onHover, cursorDataRef, cursorRefsMap, currentStatus },
    ref,
  ) {
    const { scene, camera, gl } = useThree()
    const controlsRef = useRef<OrbitControlsImpl>(null)

    const mat = useMemo(() => ({
      fill:   new THREE.MeshBasicMaterial({ color: C_LAND,     side: THREE.DoubleSide }),
      hover:  new THREE.MeshBasicMaterial({ color: C_SELECTED, side: THREE.DoubleSide }),
      border: new THREE.LineBasicMaterial({ color: C_BORDER,   depthTest: true, depthWrite: false }),
    }), [])

    const { lodDataRef, geojsonsRef, loadedRef, aliveRef, loadLod } = useLodLoader(scene, mat.fill, mat.border)

    const activeLodRef    = useRef(-1)
    const currentLevelRef = useRef(-1)
    const hoveredNameRef  = useRef<string | null>(null)
    const hoveredGroupRef = useRef<THREE.Group | null>(null)
    const fovRef          = useRef(MAX_FOV)
    const flyRafRef       = useRef<number | null>(null)
    const lastHitRef      = useRef(0)
    const lastCamRef      = useRef(0)

    // setFov is genuinely memoized below (it's a dependency of the native
    // wheel/pinch-zoom listeners' effects, and is exposed via the imperative
    // handle), so onFovChange needs the latest-ref treatment to avoid setFov
    // itself changing identity whenever the parent passes a new callback.
    const onFovChangeRef = useLatestRef(onFovChange)
    // The bootstrap effect below (empty deps, runs once) reports the
    // auto-selected starting country asynchronously — it needs the latest
    // onHover, not whichever one existed on mount.
    const onHoverRef = useLatestRef(onHover)

    const pc = camera as THREE.PerspectiveCamera

    // Not memoized — only ever called from the pointer/click handlers below,
    // which are themselves unmemoized (see their comment for why).
    const selectCountry = (name: string | null) => {
      if (!name || name === hoveredNameRef.current) return
      if (hoveredGroupRef.current) applyMat(hoveredGroupRef.current, mat.fill)
      hoveredNameRef.current = name
      const lod = lodDataRef.current[activeLodRef.current]
      const g   = lod?.fillMap.get(name) ?? null
      hoveredGroupRef.current = g
      if (g) applyMat(g, mat.hover)
      onHover?.(name)
    }

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
    }, [mat, lodDataRef])

    const setFov = useCallback((fov: number) => {
      const f = clamp(fov, MIN_FOV, MAX_FOV)
      fovRef.current = f
      pc.fov = f
      pc.updateProjectionMatrix()

      if (controlsRef.current) {
        const tuning = orbitControlsTuning(f)
        controlsRef.current.rotateSpeed   = tuning.rotateSpeed
        controlsRef.current.dampingFactor = tuning.dampingFactor
      }

      onFovChangeRef.current?.(f)

      const level = lodForFov(f)
      if (level !== currentLevelRef.current) {
        currentLevelRef.current = level
        loadedRef.current[level]
          ? applyLod(level)
          : loadLod(level, loadedLevel => { if (lodForFov(fovRef.current) === loadedLevel) applyLod(loadedLevel) })
      }
    }, [pc, applyLod, loadLod, loadedRef, onFovChangeRef])

    const zoomByRatio = useCallback((r: number) => { setFov(fovRef.current * r) }, [setFov])

    const animateTo = useCallback((targetDir: THREE.Vector3, targetFov: number) => {
      if (flyRafRef.current !== null) { cancelAnimationFrame(flyRafRef.current); flyRafRef.current = null }
      const startPos = pc.position.clone()
      const startFov = fovRef.current
      const start    = performance.now()
      if (controlsRef.current) controlsRef.current.enabled = false

      const tick = () => {
        const raw = Math.min((performance.now() - start) / 1200, 1)
        const t   = easeInOutCubic(raw)
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
      const onLoaded = (level: number) => { if (lodForFov(fovRef.current) === level) applyLod(level) }
      const preload = async () => {
        await loadLod(0, onLoaded)
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
              ? [feat.geometry.coordinates]
              : feat.geometry.coordinates
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

        await loadLod(1, onLoaded)
        if (!aliveRef.current) return
        await loadLod(2, onLoaded)
      }
      preload()
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Material cleanup — the LOD loader disposes its own geometries.
    useEffect(() => () => {
      mat.fill.dispose()
      mat.hover.dispose()
      mat.border.dispose()
    }, [mat])

    useCursorFrameProjection(cursorDataRef, cursorRefsMap, currentStatus)

    // Throttled camera orientation callback — reads onCameraChange directly
    // (not via a ref): safe because useFrame re-registers this callback
    // fresh every render internally.
    useFrame(() => {
      const now = performance.now()
      if (onCameraChange && now - lastCamRef.current > 200) {
        lastCamRef.current = now
        const { lat, lon } = vec3ToLatLon(camera.position.clone().normalize())
        onCameraChange(lat, lon)
      }
    })

    // Not memoized: R3F reads event handler props fresh from the instance at
    // dispatch time, so there's nothing to gain from useCallback here.
    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
      const { lat, lon } = vec3ToLatLon(e.point.clone().normalize())
      onCursorMove?.(lat, lon)
      // Throttle hit-test to ~30fps
      const now = performance.now()
      if (now - lastHitRef.current < 32) return
      lastHitRef.current = now
      selectCountry(pickCountry(lon, lat, geojsonsRef.current[activeLodRef.current]?.features ?? []))
    }

    // onClick handles mobile taps (browser suppresses it after a drag, so no conflict with rotation)
    const handleClick = (e: ThreeEvent<MouseEvent>) => {
      const { lat, lon } = vec3ToLatLon(e.point.clone().normalize())
      selectCountry(pickCountry(lon, lat, geojsonsRef.current[activeLodRef.current]?.features ?? []))
    }

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

  const sceneRef = useRef<SceneHandle>(null)
  const { cursorDataRef, cursorRefsMap, cursorMeta } = useCursorTracker(cursors)

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

  const cameraPosition = useMemo<[number, number, number]>(() => {
    if (!initialPosition) return [CAMERA_DIST, 0, 0]
    return latLngToCameraPos(initialPosition.lat, initialPosition.lng, CAMERA_DIST)
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
          <div
            className="absolute px-2 py-0.5 rounded-full text-white text-[11px] font-semibold whitespace-nowrap shadow-sm select-none"
            style={{ top: 0, left: 0, backgroundColor: color }}
          >
            {alias || '…'}
          </div>
        </div>
      ))}

    </div>
  )
})
