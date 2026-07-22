import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import * as THREE from 'three'
import { useLodLoader } from './useLodLoader'
import { fetchGeo } from './fetch'
import type { WorkerResponse } from '@/workers/geoBuilder.worker'
import type { GeoCollection } from './types'

vi.mock('./fetch', () => ({ fetchGeo: vi.fn() }))

class FakeWorker {
  static instances: FakeWorker[] = []

  listeners: { message: ((e: MessageEvent<WorkerResponse>) => void)[]; error: ((e: { message: string }) => void)[] } = {
    message: [],
    error: [],
  }
  posted: unknown[] = []
  terminated = false

  constructor(public url: URL | string) {
    FakeWorker.instances.push(this)
  }

  addEventListener(type: 'message' | 'error', cb: never) {
    this.listeners[type].push(cb)
  }
  removeEventListener(type: 'message' | 'error', cb: never) {
    this.listeners[type] = (this.listeners[type] as never[]).filter(l => l !== cb) as never
  }
  postMessage(msg: unknown) {
    this.posted.push(msg)
  }
  terminate() {
    this.terminated = true
  }

  // -- test helpers, not part of the real Worker API --

  respond(response: WorkerResponse) {
    for (const cb of this.listeners.message) cb({ data: response } as MessageEvent<WorkerResponse>)
  }

  fail(message: string) {
    for (const cb of this.listeners.error) cb({ message })
  }

  static latest(): FakeWorker {
    const w = FakeWorker.instances.at(-1)
    if (!w) throw new Error('no FakeWorker instance created yet')
    return w
  }
}

function emptyGeojson(): GeoCollection {
  return { type: 'FeatureCollection', features: [] }
}

function workerResponse(level: number, names: string[] = []): WorkerResponse {
  return { level, features: names.map(name => ({ name, fills: [], borders: [] })) }
}

function renderLoader() {
  const scene    = new THREE.Scene()
  const fillMat  = new THREE.MeshBasicMaterial()
  const borderMat = new THREE.LineBasicMaterial()
  const { result, unmount } = renderHook(() => useLodLoader(scene, fillMat, borderMat))
  return { result, scene, unmount }
}

beforeEach(() => {
  FakeWorker.instances = []
  vi.stubGlobal('Worker', FakeWorker)
  vi.mocked(fetchGeo).mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useLodLoader', () => {
  it('creates a worker on mount and terminates it on unmount', () => {
    const { unmount } = renderLoader()
    expect(FakeWorker.instances).toHaveLength(1)
    const worker = FakeWorker.latest()
    expect(worker.terminated).toBe(false)

    unmount()
    expect(worker.terminated).toBe(true)
  })

  it('fetches, posts to the worker, and stores the built LodData once resolved', async () => {
    const geojson = emptyGeojson()
    vi.mocked(fetchGeo).mockResolvedValue(geojson)
    const { result, scene } = renderLoader()

    let pending!: Promise<void>
    act(() => { pending = result.current.loadLod(0) })

    await waitFor(() => expect(FakeWorker.latest().posted).toHaveLength(1))
    expect(FakeWorker.latest().posted[0]).toEqual({ level: 0, geojson })

    act(() => FakeWorker.latest().respond(workerResponse(0, ['Spain'])))
    await act(async () => { await pending })

    expect(result.current.loadedRef.current[0]).toBe(true)
    expect(result.current.geojsonsRef.current[0]).toBe(geojson)

    const data = result.current.lodDataRef.current[0]!
    expect(data.fillMap.has('Spain')).toBe(true)
    expect(scene.children).toContain(data.borders)
    expect(scene.children).toContain(data.fills)
  })

  it('reuses the in-flight promise for a second call to the same level (single fetch)', async () => {
    vi.mocked(fetchGeo).mockResolvedValue(emptyGeojson())
    const { result } = renderLoader()

    let p1!: Promise<void>
    let p2!: Promise<void>
    act(() => {
      p1 = result.current.loadLod(1)
      p2 = result.current.loadLod(1)
    })

    expect(p1).toBe(p2)
    expect(fetchGeo).toHaveBeenCalledTimes(1)

    await waitFor(() => expect(FakeWorker.latest().posted).toHaveLength(1))
    act(() => FakeWorker.latest().respond(workerResponse(1)))
    await act(async () => { await p1 })
  })

  it('resolves immediately without refetching once a level has already loaded', async () => {
    vi.mocked(fetchGeo).mockResolvedValue(emptyGeojson())
    const { result } = renderLoader()

    act(() => { result.current.loadLod(2) })
    await waitFor(() => expect(FakeWorker.latest().posted).toHaveLength(1))
    act(() => FakeWorker.latest().respond(workerResponse(2)))
    await waitFor(() => expect(result.current.loadedRef.current[2]).toBe(true))

    vi.mocked(fetchGeo).mockClear()
    await act(async () => { await result.current.loadLod(2) })
    expect(fetchGeo).not.toHaveBeenCalled()
  })

  it('calls onLoaded with the level and the built data once loading finishes', async () => {
    vi.mocked(fetchGeo).mockResolvedValue(emptyGeojson())
    const { result } = renderLoader()
    const onLoaded = vi.fn()

    act(() => { result.current.loadLod(0, onLoaded) })
    await waitFor(() => expect(FakeWorker.latest().posted).toHaveLength(1))
    act(() => FakeWorker.latest().respond(workerResponse(0)))
    await waitFor(() => expect(onLoaded).toHaveBeenCalledTimes(1))

    expect(onLoaded).toHaveBeenCalledWith(0, result.current.lodDataRef.current[0])
  })

  it('ignores a worker message for a different level — the worker is shared across all 3 levels', async () => {
    vi.mocked(fetchGeo).mockResolvedValue(emptyGeojson())
    const { result } = renderLoader()

    act(() => { result.current.loadLod(0) })
    await waitFor(() => expect(FakeWorker.latest().posted).toHaveLength(1))

    act(() => FakeWorker.latest().respond(workerResponse(1))) // wrong level
    expect(result.current.loadedRef.current[0]).toBe(false)

    act(() => FakeWorker.latest().respond(workerResponse(0)))
    await waitFor(() => expect(result.current.loadedRef.current[0]).toBe(true))
  })

  it('does not store data if the component unmounts before the worker responds', async () => {
    vi.mocked(fetchGeo).mockResolvedValue(emptyGeojson())
    const { result, unmount } = renderLoader()

    act(() => { result.current.loadLod(0) })
    await waitFor(() => expect(FakeWorker.latest().posted).toHaveLength(1))

    unmount()
    act(() => FakeWorker.latest().respond(workerResponse(0)))
    await new Promise(r => setTimeout(r, 0)) // flush the aliveRef-guarded microtask

    expect(result.current.loadedRef.current[0]).toBe(false)
  })

  it('rejects the returned promise when the worker reports an error', async () => {
    vi.mocked(fetchGeo).mockResolvedValue(emptyGeojson())
    const { result } = renderLoader()

    let pending!: Promise<void>
    act(() => { pending = result.current.loadLod(0) })
    await waitFor(() => expect(FakeWorker.latest().posted).toHaveLength(1))

    act(() => FakeWorker.latest().fail('boom'))

    await expect(pending).rejects.toThrow('boom')
    expect(result.current.loadedRef.current[0]).toBe(false)
  })
})
