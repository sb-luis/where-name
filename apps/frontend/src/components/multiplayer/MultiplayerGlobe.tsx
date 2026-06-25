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
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'

import { GlobeRefLines } from '@/components/globe/GlobeRefLines'
import { latLonToVec3, vec3ToLatLon } from '@/lib/geo/geometry'
import { pickCountry } from '@/lib/geo/hit-test'
import { fetchGeo } from '@/lib/geo/fetch'
import { LEVELS, lodForFov, clamp, CAMERA_DIST, MIN_FOV, MAX_FOV, fovToSlider, sliderToFov } from '@/lib/geo/lod'
import { C_OCEAN, C_LAND, C_BORDER, C_SELECTED, C_CORRECT, C_WRONG } from '@/lib/geo/palette'
import type { GeoCollection } from '@/lib/geo/types'
import type { WorkerResponse } from '@/workers/geoBuilder.worker'
import type { CursorData } from '@/lib/multiplayer/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LodData {
  borders: THREE.Group
  fills:   THREE.Group
  fillMap: Map<string, THREE.Group>
}

interface Materials {
  fillDim:     THREE.MeshBasicMaterial
  fillHigh:    THREE.MeshBasicMaterial
  fillCorrect: THREE.MeshBasicMaterial
  fillWrong:   THREE.MeshBasicMaterial
  border:      THREE.LineBasicMaterial
}

interface CursorState {
  currentVec: THREE.Vector3
  targetVec:  THREE.Vector3
  color:      string
  alias:      string
  status:     'home' | 'playing'
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function applyMat(group: THREE.Group, mat: THREE.Material) {
  for (const child of group.children) (child as THREE.Mesh).material = mat
}

function reconstructLodData(response: WorkerResponse, mats: Materials): LodData {
  const borders = new THREE.Group()
  const fills   = new THREE.Group()
  const fillMap = new Map<string, THREE.Group>()

  for (const feat of response.features) {
    const featureFills = new THREE.Group()

    for (const { positions, indices } of feat.fills) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setIndex(new THREE.BufferAttribute(indices, 1))
      const mesh = new THREE.Mesh(geo, mats.fillDim)
      mesh.renderOrder = 1
      featureFills.add(mesh)
    }

    fills.add(featureFills)
    fillMap.set(feat.name, featureFills)

    for (const borderPositions of feat.borders) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(borderPositions, 3))
      const line = new THREE.Line(geo, mats.border)
      line.renderOrder = 999
      borders.add(line)
    }
  }

  return { borders, fills, fillMap }
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
  clearHighlight:   () => void
}

// ─── R3F scene ────────────────────────────────────────────────────────────────

interface SceneProps {
  onSelect:      (name: string | null) => void
  onFovChange?:  (fov: number) => void
  onCursorMove?: (lat: number, lng: number) => void
  cursorDataRef: React.RefObject<Map<string, CursorState>>
  cursorRefsMap: React.RefObject<Map<string, HTMLDivElement>>
  currentStatus: 'home' | 'playing'
  interactive?:  boolean
}

const MultiplayerScene = forwardRef<MultiplayerGlobeSceneHandle, SceneProps>(
  function MultiplayerScene(
    { onSelect, onFovChange, onCursorMove, cursorDataRef, cursorRefsMap, currentStatus, interactive = true },
    ref,
  ) {
    const interactiveRef = useRef(interactive)
    interactiveRef.current = interactive

    const { scene, camera, gl } = useThree()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const controlsRef = useRef<any>(null)

    const mats = useMemo<Materials>(() => ({
      fillDim:     new THREE.MeshBasicMaterial({ color: C_LAND,     side: THREE.DoubleSide }),
      fillHigh:    new THREE.MeshBasicMaterial({ color: C_SELECTED, side: THREE.DoubleSide }),
      fillCorrect: new THREE.MeshBasicMaterial({ color: C_CORRECT,  side: THREE.DoubleSide }),
      fillWrong:   new THREE.MeshBasicMaterial({ color: C_WRONG,    side: THREE.DoubleSide }),
      border:      new THREE.LineBasicMaterial({ color: C_BORDER,   depthTest: true, depthWrite: false }),
    }), [])

    const workerRef        = useRef<Worker | null>(null)
    const lodDataRef       = useRef<(LodData | null)[]>([null, null, null])
    const geojsonsRef      = useRef<(GeoCollection | null)[]>([null, null, null])
    const loadedRef        = useRef<boolean[]>([false, false, false])
    const buildPromiseRef  = useRef<(Promise<void> | null)[]>([null, null, null])
    const activeLodRef     = useRef(-1)
    const currentLevelRef  = useRef(-1)
    const selectedNameRef  = useRef<string | null>(null)
    const selectedGroupRef = useRef<THREE.Group | null>(null)
    const gameHlNameRef    = useRef<string | null>(null)
    const gameHlMatRef     = useRef<THREE.MeshBasicMaterial | null>(null)
    const fovRef           = useRef(MAX_FOV)
    const aliveRef         = useRef(true)
    const flyRafRef        = useRef<number | null>(null)
    const onCursorMoveRef  = useRef(onCursorMove)
    onCursorMoveRef.current = onCursorMove

    const pc = camera as THREE.PerspectiveCamera

    const clearSelectionMaterials = useCallback(() => {
      if (!selectedNameRef.current) return
      for (let i = 0; i < 3; i++) {
        const d = lodDataRef.current[i]
        if (d) {
          const g = d.fillMap.get(selectedNameRef.current!)
          if (g) applyMat(g, mats.fillDim)
        }
      }
      selectedGroupRef.current = null
    }, [mats])

    const restoreSelection = useCallback((fillMap: Map<string, THREE.Group>) => {
      if (!selectedNameRef.current) return
      const g = fillMap.get(selectedNameRef.current)
      if (g) { selectedGroupRef.current = g; applyMat(g, mats.fillHigh) }
    }, [mats])

    const clearGameHighlight = useCallback(() => {
      if (!gameHlNameRef.current) return
      for (let i = 0; i < 3; i++) {
        const d = lodDataRef.current[i]
        if (d) {
          const g = d.fillMap.get(gameHlNameRef.current!)
          if (g) applyMat(g, mats.fillDim)
        }
      }
      gameHlNameRef.current = null
      gameHlMatRef.current  = null
    }, [mats])

    const restoreGameHighlight = useCallback((fillMap: Map<string, THREE.Group>) => {
      if (!gameHlNameRef.current || !gameHlMatRef.current) return
      const g = fillMap.get(gameHlNameRef.current)
      if (g) applyMat(g, gameHlMatRef.current)
    }, [])

    const setGameHighlight = useCallback((name: string, mat: THREE.MeshBasicMaterial) => {
      clearGameHighlight()
      gameHlNameRef.current = name
      gameHlMatRef.current  = mat
      for (let i = 0; i < 3; i++) {
        const d = lodDataRef.current[i]
        if (d) {
          const g = d.fillMap.get(name)
          if (g) applyMat(g, mat)
        }
      }
    }, [clearGameHighlight])

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
    }, [clearSelectionMaterials, restoreSelection, restoreGameHighlight])

    const loadLod = useCallback((level: number): Promise<void> => {
      if (loadedRef.current[level]) return Promise.resolve()
      if (buildPromiseRef.current[level]) return buildPromiseRef.current[level]!

      buildPromiseRef.current[level] = (async () => {
        const worker = workerRef.current
        if (!worker) return

        const geojson = await fetchGeo(LEVELS[level].url)
        if (!aliveRef.current) return

        const response = await new Promise<WorkerResponse>((resolve, reject) => {
          const onMessage = (e: MessageEvent<WorkerResponse>) => {
            if (e.data.level !== level) return
            cleanup()
            resolve(e.data)
          }
          const onError = (e: ErrorEvent) => { cleanup(); reject(new Error(e.message)) }
          const cleanup = () => {
            worker.removeEventListener('message', onMessage)
            worker.removeEventListener('error', onError)
          }
          worker.addEventListener('message', onMessage)
          worker.addEventListener('error', onError)
          worker.postMessage({ level, geojson })
        })

        if (!aliveRef.current) return

        const data = reconstructLodData(response, mats)
        data.borders.visible = false
        data.fills.visible   = false
        scene.add(data.borders)
        scene.add(data.fills)
        lodDataRef.current[level]  = data
        geojsonsRef.current[level] = geojson
        loadedRef.current[level]   = true

        if (lodForFov(fovRef.current) === level) applyLod(level)
      })()

      return buildPromiseRef.current[level]!
    }, [scene, mats, applyLod])

    const onFovChangeRef = useRef(onFovChange)
    useEffect(() => { onFovChangeRef.current = onFovChange }, [onFovChange])

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

    const animateTo = useCallback((targetDir: THREE.Vector3, targetFov: number) => {
      if (flyRafRef.current !== null) { cancelAnimationFrame(flyRafRef.current); flyRafRef.current = null }
      const startPos  = pc.position.clone()
      const startFov  = fovRef.current
      const duration  = 1200
      const startTime = performance.now()
      const controls  = controlsRef.current
      if (controls) controls.enabled = false

      const tick = () => {
        const raw  = Math.min((performance.now() - startTime) / duration, 1)
        const tArc = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2

        const dir = startPos.clone().normalize().lerp(targetDir, tArc).normalize()
        pc.position.copy(dir.multiplyScalar(CAMERA_DIST))
        pc.lookAt(0, 0, 0)
        setFov(clamp(startFov + (targetFov - startFov) * tArc, MIN_FOV, MAX_FOV))

        if (raw < 1) {
          flyRafRef.current = requestAnimationFrame(tick)
        } else {
          flyRafRef.current = null
          if (controls) { controls.enabled = true; controls.update() }
        }
      }
      flyRafRef.current = requestAnimationFrame(tick)
    }, [pc, setFov])

    const flyTo = useCallback((countryName: string) => {
      let centroid: { lat: number; lon: number } | null = null
      for (const geo of geojsonsRef.current) {
        if (!geo) continue
        const feat = geo.features.find(f => {
          const n = String(f.properties?.NAME ?? f.properties?.ADMIN ?? '')
          return n === countryName
        })
        if (!feat) continue

        const polys = feat.geometry.type === 'Polygon'
          ? [feat.geometry.coordinates as number[][][]]
          : feat.geometry.coordinates as number[][][][]

        let ring = polys[0][0]
        for (const poly of polys) { if (poly[0].length > ring.length) ring = poly[0] }
        let sumLon = 0, sumLat = 0
        for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat }
        centroid = { lat: sumLat / ring.length, lon: sumLon / ring.length }
        break
      }
      if (!centroid) return

      const phi   = (90 - centroid.lat) * (Math.PI / 180)
      const theta = (centroid.lon + 180) * (Math.PI / 180)
      const targetDir = new THREE.Vector3(
        -Math.sin(phi) * Math.cos(theta),
         Math.cos(phi),
         Math.sin(phi) * Math.sin(theta),
      )
      animateTo(targetDir, 35)
    }, [animateTo])

    const HOME_DIR = new THREE.Vector3(1, 0, 0)

    useImperativeHandle(ref, () => ({
      setFov,
      reset:            () => animateTo(HOME_DIR, MAX_FOV),
      flyTo,
      highlightCorrect: (name: string) => setGameHighlight(name, mats.fillCorrect),
      highlightWrong:   (name: string) => setGameHighlight(name, mats.fillWrong),
      clearHighlight:   clearGameHighlight,
    }), [setFov, animateTo, flyTo, setGameHighlight, clearGameHighlight, mats])

    // Worker
    useEffect(() => {
      const worker = new Worker(new URL('../../workers/geoBuilder.worker.ts', import.meta.url))
      workerRef.current = worker
      return () => { worker.terminate(); workerRef.current = null }
    }, [])

    // Zoom — wheel
    const zoomByRatio = useCallback((ratio: number) => { setFov(fovRef.current * ratio) }, [setFov])

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
      const preload = async () => {
        await loadLod(0)
        if (!aliveRef.current) return
        await loadLod(1)
        if (!aliveRef.current) return
        await loadLod(2)
      }
      preload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => () => { aliveRef.current = false }, [])

    // Cleanup
    useEffect(() => {
      return () => {
        for (const data of lodDataRef.current) {
          if (!data) continue
          scene.remove(data.borders)
          scene.remove(data.fills)
          data.borders.traverse(o => { if (o instanceof THREE.Line) o.geometry.dispose() })
          data.fills.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
        }
        mats.fillDim.dispose(); mats.fillHigh.dispose()
        mats.fillCorrect.dispose(); mats.fillWrong.dispose()
        mats.border.dispose()
      }
    }, [scene, mats])

    // Cursor animation — same as PresenceGlobe, runs every frame, writes directly to DOM
    const camDir  = useRef(new THREE.Vector3())
    const tempVec = useRef(new THREE.Vector3())

    useFrame(({ size }) => {
      const pc_ = camera as THREE.PerspectiveCamera
      const vfovRad = pc_.fov * Math.PI / 180
      const ndcR    = 1 / (CAMERA_DIST * Math.tan(vfovRad / 2))
      const globeR  = ndcR * size.height / 2
      const cx = size.width / 2
      const cy = size.height / 2

      camDir.current.copy(camera.position).normalize()

      for (const [id, state] of cursorDataRef.current) {
        state.currentVec.lerp(state.targetVec, 0.08).normalize()
        const isVisible = state.currentVec.dot(camDir.current) > 0.02

        tempVec.current.copy(state.currentVec).project(camera)
        let sx = (tempVec.current.x + 1) / 2 * size.width
        let sy = (-tempVec.current.y + 1) / 2 * size.height

        if (!isVisible) {
          const dx = sx - cx, dy = sy - cy
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist > 0) {
            const r = (globeR * 1.10) / dist
            sx = cx + dx * r
            sy = cy + dy * r
          }
        }

        const el = cursorRefsMap.current.get(id)
        if (!el) continue

        el.style.transform = `translate(${sx}px, ${sy}px)`
        el.style.opacity   = state.status === currentStatus ? '1' : '0.35'

        const arrow = el.children[0] as HTMLElement
        const label = el.children[1] as HTMLElement
        arrow.style.opacity   = '1'
        label.style.transform = 'translate(16px, -2px)'
      }
    })

    const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
      if (!interactiveRef.current) return
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
    }, [onSelect, clearSelectionMaterials, mats])

    const handlePointerMove = useCallback((e: ThreeEvent<PointerEvent>) => {
      const { lat, lon } = vec3ToLatLon(e.point.clone().normalize())
      onCursorMoveRef.current?.(lat, lon)
    }, [])

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
  clearHighlight:   () => void
}

interface Props {
  onSelect?:     (name: string | null) => void
  onCursorMove?: (lat: number, lng: number) => void
  cursors?:      CursorData[]
  currentStatus: 'home' | 'playing'
  showLabel?:    boolean
  interactive?:  boolean
}

export const MultiplayerGlobe = forwardRef<MultiplayerGlobeHandle, Props>(
  function MultiplayerGlobe(
    { onSelect, onCursorMove, cursors = [], currentStatus, showLabel = true, interactive = true },
    ref,
  ) {
    const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
    const [sliderValue, setSliderValue]         = useState(() => fovToSlider(MAX_FOV))
    const sceneRef      = useRef<MultiplayerGlobeSceneHandle>(null)
    const cursorDataRef = useRef<Map<string, CursorState>>(new Map())
    const cursorRefsMap = useRef<Map<string, HTMLDivElement>>(new Map())
    const [cursorIds, setCursorIds] = useState<string[]>([])

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
      clearHighlight:   () => sceneRef.current?.clearHighlight(),
    }), [])

    // Sync cursor data
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

    return (
      <div className="relative w-full h-full">
        <Canvas
          camera={{ fov: MAX_FOV, position: [CAMERA_DIST, 0, 0], near: 0.1, far: 100 }}
          gl={{ antialias: true }}
          style={{ width: '100%', height: '100%' }}
        >
          <MultiplayerScene
            ref={sceneRef}
            onSelect={handleSelect}
            onFovChange={handleFovChange}
            onCursorMove={onCursorMove}
            cursorDataRef={cursorDataRef}
            cursorRefsMap={cursorRefsMap}
            currentStatus={currentStatus}
            interactive={interactive}
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
                position:      'absolute',
                top:           0,
                left:          0,
                pointerEvents: 'none',
                willChange:    'transform',
              }}
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
  },
)
