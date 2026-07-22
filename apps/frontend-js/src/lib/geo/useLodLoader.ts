'use client'

import { useCallback, useEffect, useRef, type RefObject } from 'react'
import * as THREE from 'three'
import { fetchGeo } from './fetch'
import { LEVELS } from './lod'
import type { GeoCollection } from './types'
import type { WorkerResponse } from '@/workers/geoBuilder.worker'

export interface LodData {
  borders: THREE.Group
  fills:   THREE.Group
  fillMap: Map<string, THREE.Group>
}

function buildLodData(response: WorkerResponse, fillMat: THREE.Material, borderMat: THREE.Material): LodData {
  const borders = new THREE.Group()
  const fills   = new THREE.Group()
  const fillMap = new Map<string, THREE.Group>()

  for (const feat of response.features) {
    const featureFills = new THREE.Group()
    for (const { positions, indices } of feat.fills) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      geo.setIndex(new THREE.BufferAttribute(indices, 1))
      const mesh = new THREE.Mesh(geo, fillMat)
      mesh.renderOrder = 1
      featureFills.add(mesh)
    }
    fills.add(featureFills)
    fillMap.set(feat.name, featureFills)

    for (const borderPositions of feat.borders) {
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(borderPositions, 3))
      const line = new THREE.Line(geo, borderMat)
      line.renderOrder = 999
      borders.add(line)
    }
  }

  return { borders, fills, fillMap }
}

// Owns the worker + the three-level LOD cache (ExploreGlobe/MultiplayerGlobe
// both load the same 3 Natural Earth resolutions on demand, memoized so a
// level is only ever fetched/built once). Level-specific behavior (which
// level should be visible right now, hover/selection re-application) stays
// with the caller via `onLoaded`.
export function useLodLoader(scene: THREE.Scene, fillMat: THREE.Material, borderMat: THREE.Material) {
  const workerRef       = useRef<Worker | null>(null)
  const lodDataRef       = useRef<(LodData | null)[]>([null, null, null])
  const geojsonsRef      = useRef<(GeoCollection | null)[]>([null, null, null])
  const loadedRef        = useRef<boolean[]>([false, false, false])
  const buildPromiseRef  = useRef<(Promise<void> | null)[]>([null, null, null])
  const aliveRef         = useRef(true)

  useEffect(() => {
    const worker = new Worker(new URL('../../workers/geoBuilder.worker.ts', import.meta.url))
    workerRef.current = worker
    return () => { worker.terminate(); workerRef.current = null }
  }, [])

  useEffect(() => () => { aliveRef.current = false }, [])

  useEffect(() => () => {
    for (const data of lodDataRef.current) {
      if (!data) continue
      scene.remove(data.borders)
      scene.remove(data.fills)
      data.borders.traverse(o => { if (o instanceof THREE.Line) o.geometry.dispose() })
      data.fills.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
    }
  }, [scene])

  const loadLod = useCallback((level: number, onLoaded?: (level: number, data: LodData) => void): Promise<void> => {
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

      const data = buildLodData(response, fillMat, borderMat)
      data.borders.visible = false
      data.fills.visible   = false
      scene.add(data.borders)
      scene.add(data.fills)
      lodDataRef.current[level]  = data
      geojsonsRef.current[level] = geojson
      loadedRef.current[level]   = true

      onLoaded?.(level, data)
    })()

    return buildPromiseRef.current[level]!
  }, [scene, fillMat, borderMat])

  return { lodDataRef, geojsonsRef, loadedRef, aliveRef, loadLod } as {
    lodDataRef:  RefObject<(LodData | null)[]>
    geojsonsRef: RefObject<(GeoCollection | null)[]>
    loadedRef:   RefObject<boolean[]>
    aliveRef:    RefObject<boolean>
    loadLod:     (level: number, onLoaded?: (level: number, data: LodData) => void) => Promise<void>
  }
}
