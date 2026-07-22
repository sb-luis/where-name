'use client'

import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  forwardRef,
  useImperativeHandle,
} from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

import { GlobeRefLines } from '@/components/globe/GlobeRefLines'
import { vec3ToLatLon, largestRingExtent, angularExtentDeg, fitFovForExtent, latLngToCameraPos } from '@/lib/geo/geometry'
import { easeInOutCubic, orbitControlsTuning } from '@/lib/geo/camera'
import { useCursorTracker, type CursorTrackState } from '@/lib/geo/useCursorTracker'
import { useCursorFrameProjection } from '@/lib/geo/useCursorFrameProjection'
import { useLodLoader } from '@/lib/geo/useLodLoader'
import { pickCountry } from '@/lib/geo/hit-test'
import { LEVELS, lodForFov, clamp, CAMERA_DIST, MIN_FOV, MAX_FOV, REVEAL_MIN_FOV, MIN_ORBITING_FOV, fovToSlider, sliderToFov } from '@/lib/geo/lod'
import { C_OCEAN, C_LAND, C_BORDER, C_SELECTED, C_CORRECT, C_WRONG, C_WRONG_FOCUS } from '@/lib/geo/palette'
import { useLatestRef } from '@/lib/useLatestRef'
import type { GeoFeature } from '@/lib/geo/types'
import type { CursorData, UserStatus } from '@/lib/multiplayer/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Materials {
  fillDim:     THREE.MeshBasicMaterial
  fillHigh:    THREE.MeshBasicMaterial
  fillCorrect:    THREE.MeshBasicMaterial
  fillWrong:      THREE.MeshBasicMaterial
  fillWrongFocus: THREE.MeshBasicMaterial
  border:         THREE.LineBasicMaterial
}

// duration of the camera fly-to animation (ms); shared with GameScreen for the focus-highlight downgrade timing
export const FLY_DURATION_MS = 1200

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyMat(group: THREE.Group, mat: THREE.Material) {
  for (const child of group.children) (child as THREE.Mesh).material = mat
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

// ─── Scene handle ─────────────────────────────────────────────────────────────

export interface MultiplayerGlobeSceneHandle {
  setFov:           (fov: number) => void
  reset:            () => void
  flyTo:            (countryName: string) => void
  highlightCorrect: (name: string) => void
  highlightWrong:   (name: string) => void
  focusWrong:       (name: string) => void
  clearHighlight:   () => void
}

// ─── R3F scene ────────────────────────────────────────────────────────────────

interface SceneProps {
  onSelect:        (name: string | null) => void
  onFovChange?:    (fov: number) => void
  onCursorMove?:   (lat: number, lng: number) => void
  onCameraChange?: (lat: number, lng: number) => void
  cursorDataRef:   React.RefObject<Map<string, CursorTrackState>>
  cursorRefsMap:   React.RefObject<Map<string, HTMLDivElement>>
  currentStatus:   UserStatus
  interactive?:    boolean
  minLodLevel?:    0 | 1 | 2
}

const MultiplayerScene = forwardRef<MultiplayerGlobeSceneHandle, SceneProps>(
  function MultiplayerScene(
    { onSelect, onFovChange, onCursorMove, onCameraChange, cursorDataRef, cursorRefsMap, currentStatus, interactive = true, minLodLevel = 0 },
    ref,
  ) {
    // setFov/flyTo are genuinely memoized below (dependencies of the native
    // wheel/pinch-zoom effects and the imperative handle), so minLodLevel
    // needs the latest-ref treatment to avoid them changing identity
    // whenever the parent re-renders with a new minLodLevel value.
    const minLodLevelRef = useLatestRef(minLodLevel)

    const { scene, camera, gl } = useThree()
    const controlsRef = useRef<OrbitControlsImpl>(null)

    const mats = useMemo<Materials>(() => ({
      fillDim:     new THREE.MeshBasicMaterial({ color: C_LAND,     side: THREE.DoubleSide }),
      fillHigh:    new THREE.MeshBasicMaterial({ color: C_SELECTED, side: THREE.DoubleSide }),
      fillCorrect:    new THREE.MeshBasicMaterial({ color: C_CORRECT,    side: THREE.DoubleSide }),
      fillWrong:      new THREE.MeshBasicMaterial({ color: C_WRONG,      side: THREE.DoubleSide }),
      fillWrongFocus: new THREE.MeshBasicMaterial({ color: C_WRONG_FOCUS, side: THREE.DoubleSide }),
      border:      new THREE.LineBasicMaterial({ color: C_BORDER,   depthTest: true, depthWrite: false }),
    }), [])

    const { lodDataRef, geojsonsRef, loadedRef, aliveRef, loadLod } = useLodLoader(scene, mats.fillDim, mats.border)

    const featureMapsRef   = useRef<(Map<string, GeoFeature> | null)[]>([null, null, null])
    const activeLodRef     = useRef(-1)
    const currentLevelRef  = useRef(-1)
    const selectedNameRef  = useRef<string | null>(null)
    const selectedGroupRef = useRef<THREE.Group | null>(null)
    const gameHlsRef       = useRef<Map<string, THREE.MeshBasicMaterial>>(new Map())
    const fovRef           = useRef(MAX_FOV)
    const fovFloorRef      = useRef(MIN_FOV)
    const flyRafRef        = useRef<number | null>(null)
    const lastCamUpdateRef = useRef(0)

    const pc = camera as THREE.PerspectiveCamera

    const clearSelectionMaterials = useCallback(() => {
      if (!selectedNameRef.current) return
      // restore game highlight if one exists, otherwise fall back to the default land colour.
      const mat = gameHlsRef.current.get(selectedNameRef.current) ?? mats.fillDim
      for (let i = 0; i < 3; i++) {
        const d = lodDataRef.current[i]
        if (d) {
          const g = d.fillMap.get(selectedNameRef.current!)
          if (g) applyMat(g, mat)
        }
      }
      selectedGroupRef.current = null
    }, [mats, lodDataRef])

    const restoreSelection = useCallback((fillMap: Map<string, THREE.Group>) => {
      if (!selectedNameRef.current) return
      const g = fillMap.get(selectedNameRef.current)
      if (g) { selectedGroupRef.current = g; applyMat(g, mats.fillHigh) }
    }, [mats])

    const clearGameHighlight = useCallback(() => {
      for (const [name] of gameHlsRef.current) {
        for (let i = 0; i < 3; i++) {
          const d = lodDataRef.current[i]
          if (d) {
            const g = d.fillMap.get(name)
            if (g) applyMat(g, mats.fillDim)
          }
        }
      }
      gameHlsRef.current.clear()
    }, [mats, lodDataRef])

    const restoreGameHighlight = useCallback((fillMap: Map<string, THREE.Group>) => {
      for (const [name, mat] of gameHlsRef.current) {
        const g = fillMap.get(name)
        if (g) applyMat(g, mat)
      }
    }, [])

    const setGameHighlight = useCallback((name: string, mat: THREE.MeshBasicMaterial) => {
      gameHlsRef.current.set(name, mat)
      for (let i = 0; i < 3; i++) {
        const d = lodDataRef.current[i]
        if (d) {
          const g = d.fillMap.get(name)
          if (g) applyMat(g, mat)
        }
      }
    }, [lodDataRef])

    const applyLod = useCallback((level: number) => {
      const data = lodDataRef.current[level]
      if (!data) return
      for (let i = 0; i < 3; i++) {
        if (i === level) continue
        const d = lodDataRef.current[i]
        if (d) { d.borders.visible = false; d.fills.visible = false }
      }
      clearSelectionMaterials()
      activeLodRef.current = level
      data.borders.visible = true
      data.fills.visible   = true
      restoreSelection(data.fillMap)
      restoreGameHighlight(data.fillMap)
    }, [clearSelectionMaterials, restoreSelection, restoreGameHighlight, lodDataRef])

    const onFovChangeRef = useLatestRef(onFovChange)

    const setFov = useCallback((fov: number) => {
      const f = clamp(fov, fovFloorRef.current, MAX_FOV)
      fovRef.current = f
      pc.fov = f
      pc.updateProjectionMatrix()

      if (controlsRef.current) {
        const tuning = orbitControlsTuning(f)
        controlsRef.current.rotateSpeed   = tuning.rotateSpeed
        controlsRef.current.dampingFactor = tuning.dampingFactor
      }

      onFovChangeRef.current?.(f)

      const level = Math.max(lodForFov(f), minLodLevelRef.current) as 0 | 1 | 2
      if (level !== currentLevelRef.current) {
        currentLevelRef.current = level
        loadedRef.current[level]
          ? applyLod(level)
          : loadLod(level, loadedLevel => { if (lodForFov(fovRef.current) === loadedLevel) applyLod(loadedLevel) })
      }
    }, [pc, applyLod, loadLod, loadedRef, onFovChangeRef, minLodLevelRef])

    const animateTo = useCallback((targetDir: THREE.Vector3, targetFov: number) => {
      if (flyRafRef.current !== null) { cancelAnimationFrame(flyRafRef.current); flyRafRef.current = null }
      const startPos  = pc.position.clone()
      const startFov  = fovRef.current
      const peakFov   = Math.max(startFov, targetFov, MIN_ORBITING_FOV)
      const duration  = FLY_DURATION_MS
      const startTime = performance.now()
      const controls  = controlsRef.current
      if (controls) controls.enabled = false

      const tick = () => {
        const raw  = Math.min((performance.now() - startTime) / duration, 1)
        const tArc = easeInOutCubic(raw)

        const dir = startPos.clone().normalize().lerp(targetDir, tArc).normalize()
        pc.position.copy(dir.multiplyScalar(CAMERA_DIST))
        pc.lookAt(0, 0, 0)

        // pull back to peakFov in the first half, settle onto targetFov in the second — keeps travel zoomed out
        const fov = raw < 0.5
          ? startFov + (peakFov - startFov) * easeInOutCubic(raw * 2)
          : peakFov + (targetFov - peakFov) * easeInOutCubic((raw - 0.5) * 2)
        setFov(clamp(fov, fovFloorRef.current, MAX_FOV))

        if (raw < 1) {
          flyRafRef.current = requestAnimationFrame(tick)
        } else {
          flyRafRef.current = null
          if (controls) { controls.enabled = true; controls.update() }
        }
      }
      flyRafRef.current = requestAnimationFrame(tick)
    }, [pc, setFov])

    const getFeatureMap = useCallback((level: number): Map<string, GeoFeature> | null => {
      const geo = geojsonsRef.current[level]
      if (!geo) return null
      if (!featureMapsRef.current[level]) {
        const map = new Map<string, GeoFeature>()
        for (const f of geo.features) {
          const n = String(f.properties?.NAME ?? f.properties?.ADMIN ?? '')
          map.set(n, f)
        }
        featureMapsRef.current[level] = map
      }
      return featureMapsRef.current[level]
    }, [geojsonsRef])

    const flyTo = useCallback((countryName: string) => {
      let feat: GeoFeature | undefined
      let requiredLevel: 0 | 1 | 2 = 0
      for (let level = 0; level < 3; level++) {
        feat = getFeatureMap(level)?.get(countryName)
        if (feat) { requiredLevel = level as 0 | 1 | 2; break }
      }
      if (!feat) return

      const polys = feat.geometry.type === 'Polygon'
        ? [feat.geometry.coordinates]
        : feat.geometry.coordinates

      const extent = largestRingExtent(polys)
      const phi   = (90 - extent.centerLat) * (Math.PI / 180)
      const theta = (extent.centerLon + 180) * (Math.PI / 180)
      const targetDir = new THREE.Vector3(
        -Math.sin(phi) * Math.cos(theta),
         Math.cos(phi),
         Math.sin(phi) * Math.sin(theta),
      )
      const fillFov = fitFovForExtent(angularExtentDeg(extent), CAMERA_DIST)
      // don't frame further out than where requiredLevel's dataset is guaranteed active
      const lodBound = requiredLevel === 0 || minLodLevelRef.current >= requiredLevel
        ? MAX_FOV
        : LEVELS[requiredLevel - 1].fovMin
      const targetFov = clamp(Math.min(fillFov, lodBound), REVEAL_MIN_FOV, 35)
      fovFloorRef.current = REVEAL_MIN_FOV
      animateTo(targetDir, targetFov)
    }, [animateTo, getFeatureMap, minLodLevelRef])

    const HOME_DIR = new THREE.Vector3(1, 0, 0)

    useImperativeHandle(ref, () => ({
      setFov: (fov: number) => { fovFloorRef.current = MIN_FOV; setFov(fov) },
      reset:            () => { fovFloorRef.current = MIN_FOV; animateTo(HOME_DIR, MAX_FOV) },
      flyTo,
      highlightCorrect: (name: string) => setGameHighlight(name, mats.fillCorrect),
      highlightWrong:   (name: string) => setGameHighlight(name, mats.fillWrong),
      focusWrong:       (name: string) => setGameHighlight(name, mats.fillWrongFocus),
      clearHighlight:   clearGameHighlight,
    }), [setFov, animateTo, flyTo, setGameHighlight, clearGameHighlight, mats])

    // Zoom — wheel
    const zoomByRatio = useCallback((ratio: number) => {
      fovFloorRef.current = MIN_FOV
      setFov(fovRef.current * ratio)
    }, [setFov])

    useEffect(() => {
      const canvas = gl.domElement
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 600 : 1)
        zoomByRatio(Math.exp(pixels * 0.0008))
      }
      canvas.addEventListener('wheel', onWheel, { passive: false })
      return () => canvas.removeEventListener('wheel', onWheel)
    }, [gl, zoomByRatio])

    // Zoom — pinch
    useEffect(() => {
      const canvas = gl.domElement
      let prevPinchDist = 0
      const getTouchDist = (t: TouchList) => {
        if (t.length < 2) return 0
        const dx = t[0].clientX - t[1].clientX
        const dy = t[0].clientY - t[1].clientY
        return Math.sqrt(dx * dx + dy * dy)
      }
      const onTouchStart = (e: TouchEvent) => { if (e.touches.length === 2) prevPinchDist = getTouchDist(e.touches) }
      const onTouchMove  = (e: TouchEvent) => {
        if (e.touches.length !== 2) return
        e.preventDefault()
        const d = getTouchDist(e.touches)
        if (prevPinchDist > 0) zoomByRatio(prevPinchDist / d)
        prevPinchDist = d
      }
      const onTouchEnd = () => { prevPinchDist = 0 }
      canvas.addEventListener('touchstart', onTouchStart, { passive: true })
      canvas.addEventListener('touchmove', onTouchMove, { passive: false })
      canvas.addEventListener('touchend', onTouchEnd, { passive: true })
      return () => {
        canvas.removeEventListener('touchstart', onTouchStart)
        canvas.removeEventListener('touchmove', onTouchMove)
        canvas.removeEventListener('touchend', onTouchEnd)
      }
    }, [gl, zoomByRatio])

    // Bootstrap
    useEffect(() => {
      setFov(MAX_FOV)
      const onLoaded = (level: number) => { if (lodForFov(fovRef.current) === level) applyLod(level) }
      const preload = async () => {
        await loadLod(0, onLoaded)
        if (!aliveRef.current) return
        await loadLod(1, onLoaded)
        if (!aliveRef.current) return
        await loadLod(2, onLoaded)
      }
      preload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // Cleanup — the LOD loader disposes its own geometries; this component
    // only needs to dispose the materials it owns.
    useEffect(() => {
      return () => {
        mats.fillDim.dispose(); mats.fillHigh.dispose()
        mats.fillCorrect.dispose(); mats.fillWrong.dispose()
        mats.border.dispose()
      }
    }, [mats])

    useCursorFrameProjection(cursorDataRef, cursorRefsMap, currentStatus)

    // Reads onCameraChange directly (not via a ref): safe because useFrame
    // re-registers this callback fresh every render internally.
    useFrame(() => {
      // ── Camera orientation (throttled 200 ms) ────────────────────────────────
      const now = performance.now()
      if (onCameraChange && now - lastCamUpdateRef.current > 200) {
        lastCamUpdateRef.current = now
        const { lat, lon } = vec3ToLatLon(camera.position.clone().normalize())
        onCameraChange(lat, lon)
      }
    })

    // Not memoized: R3F reads event handler props fresh from the instance at
    // dispatch time, so there's nothing to gain from useCallback here.
    const handleDoubleClick = (e: ThreeEvent<MouseEvent>) => {
      if (!interactive) return
      e.stopPropagation()
      const { lat, lon } = vec3ToLatLon(e.point.clone().normalize())
      const features = geojsonsRef.current[activeLodRef.current]?.features ?? []
      const name = pickCountry(lon, lat, features)

      clearSelectionMaterials()
      selectedNameRef.current = name

      if (name) {
        const g = lodDataRef.current[activeLodRef.current]?.fillMap.get(name)
        if (g) { selectedGroupRef.current = g; applyMat(g, mats.fillHigh) }
      }
      onSelect(name)
    }

    const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
      const { lat, lon } = vec3ToLatLon(e.point.clone().normalize())
      onCursorMove?.(lat, lon)
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
        <mesh onDoubleClick={handleDoubleClick} onPointerMove={handlePointerMove}>
          <sphereGeometry args={[1, 64, 64]} />
          <meshBasicMaterial color={C_OCEAN} />
        </mesh>
        <GlobeRefLines />
      </>
    )
  },
)

// ─── Public component ─────────────────────────────────────────────────────────

export interface MultiplayerGlobeHandle {
  reset:            () => void
  flyTo:            (countryName: string) => void
  highlightCorrect: (name: string) => void
  highlightWrong:   (name: string) => void
  focusWrong:       (name: string) => void
  clearHighlight:   () => void
}

interface Props {
  onSelect?:        (name: string | null) => void
  onCursorMove?:    (lat: number, lng: number) => void
  onCameraChange?:  (lat: number, lng: number) => void
  cursors?:         CursorData[]
  currentStatus:    UserStatus
  initialPosition?: { lat: number; lng: number }
  showLabel?:       boolean
  interactive?:     boolean
  minLodLevel?:     0 | 1 | 2
}

export const MultiplayerGlobe = forwardRef<MultiplayerGlobeHandle, Props>(
  function MultiplayerGlobe(
    { onSelect, onCursorMove, onCameraChange, cursors = [], currentStatus, initialPosition, showLabel = true, interactive = true, minLodLevel = 0 },
    ref,
  ) {
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
    const [sliderValue, setSliderValue]         = useState(() => fovToSlider(MAX_FOV))
    const sceneRef = useRef<MultiplayerGlobeSceneHandle>(null)
    const { cursorDataRef, cursorRefsMap, cursorMeta } = useCursorTracker(cursors)

    const handleSelect = useCallback((name: string | null) => {
      setSelectedCountry(name)
      onSelect?.(name)
    }, [onSelect])

    const handleFovChange = useCallback((fov: number) => {
      setSliderValue(fovToSlider(fov))
    }, [])

    const handleSliderInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value)
      setSliderValue(v)
      sceneRef.current?.setFov(sliderToFov(v))
    }, [])

    useImperativeHandle(ref, () => ({
      reset:            () => sceneRef.current?.reset(),
      flyTo:            (name) => sceneRef.current?.flyTo(name),
      highlightCorrect: (name) => sceneRef.current?.highlightCorrect(name),
      highlightWrong:   (name) => sceneRef.current?.highlightWrong(name),
      focusWrong:       (name) => sceneRef.current?.focusWrong(name),
      clearHighlight:   () => sceneRef.current?.clearHighlight(),
    }), [])

    const cameraPosition: [number, number, number] = initialPosition
      ? latLngToCameraPos(initialPosition.lat, initialPosition.lng, CAMERA_DIST)
      : [CAMERA_DIST, 0, 0]

    return (
      <div className="relative w-full h-full">
        <Canvas
          camera={{ fov: MAX_FOV, position: cameraPosition, near: 0.1, far: 100 }}
          gl={{ antialias: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <MultiplayerScene
            ref={sceneRef}
            onSelect={handleSelect}
            onFovChange={handleFovChange}
            onCursorMove={onCursorMove}
            onCameraChange={onCameraChange}
            cursorDataRef={cursorDataRef}
            cursorRefsMap={cursorRefsMap}
            currentStatus={currentStatus}
            interactive={interactive}
            minLodLevel={minLodLevel}
          />
        </Canvas>

        {/* Zoom slider */}
        <div className="globe-zoom-slider-wrap">
          <span className="globe-zoom-label">−</span>
          <input
            className="globe-zoom-slider"
            type="range"
            min="0"
            max="1"
            step="0.001"
            value={sliderValue}
            onChange={handleSliderInput}
          />
          <span className="globe-zoom-label">+</span>
        </div>

        {/* Country label */}
        {showLabel && (
          <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
            {selectedCountry ? (
              <span className="rounded-full bg-white/80 px-4 py-1.5 text-sm font-medium text-gray-800 shadow backdrop-blur-sm">
                {selectedCountry}
              </span>
            ) : (
              <span className="text-sm text-gray-400">double-click a country</span>
            )}
          </div>
        )}

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
            <div style={{ position: 'absolute', top: 0, left: 0 }}>
              <CursorLabel alias={alias || '…'} color={color} />
            </div>
          </div>
        ))}

      </div>
    )
  },
)
