import { describe, it, expect } from 'vitest'
import { easeInOutCubic, orbitControlsTuning, globeScreenRadius, clampToGlobeEdge } from './camera'

describe('easeInOutCubic', () => {
  it('maps the endpoints and midpoint exactly', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(0.5)).toBe(0.5)
  })

  it('is point-symmetric around (0.5, 0.5)', () => {
    for (const t of [0.1, 0.25, 0.4, 0.9]) {
      expect(easeInOutCubic(1 - t)).toBeCloseTo(1 - easeInOutCubic(t), 10)
    }
  })

  it('is monotonically increasing', () => {
    const samples = Array.from({ length: 11 }, (_, i) => easeInOutCubic(i / 10))
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1])
    }
  })
})

describe('orbitControlsTuning', () => {
  it('matches the zoom = 60 / fov derivation', () => {
    const fov = 40
    const zoom = 60 / fov
    const { rotateSpeed, dampingFactor } = orbitControlsTuning(fov)
    expect(rotateSpeed).toBeCloseTo(0.95 / Math.pow(zoom + 0.5, 1.15), 10)
    expect(dampingFactor).toBeCloseTo(0.1 + Math.min(zoom / 200, 1) * 0.4, 10)
  })

  it('rotates slower and damps more as the camera zooms in (lower fov)', () => {
    const zoomedOut = orbitControlsTuning(80)
    const zoomedIn = orbitControlsTuning(5)
    expect(zoomedIn.rotateSpeed).toBeLessThan(zoomedOut.rotateSpeed)
    expect(zoomedIn.dampingFactor).toBeGreaterThan(zoomedOut.dampingFactor)
  })

  it('caps dampingFactor contribution at zoom = 200', () => {
    const atCap = orbitControlsTuning(60 / 200)
    const beyondCap = orbitControlsTuning(60 / 400)
    expect(atCap.dampingFactor).toBeCloseTo(0.5, 10)
    expect(beyondCap.dampingFactor).toBeCloseTo(0.5, 10)
  })
})

describe('globeScreenRadius', () => {
  it('matches the ndcR/globeR derivation', () => {
    const fovDeg = 44, height = 900, dist = 3
    const vfovRad = fovDeg * Math.PI / 180
    const expected = (1 / (dist * Math.tan(vfovRad / 2))) * height / 2
    expect(globeScreenRadius(fovDeg, height, dist)).toBeCloseTo(expected, 10)
  })

  it('grows with viewport height and shrinks with camera distance', () => {
    const base = globeScreenRadius(44, 900, 3)
    expect(globeScreenRadius(44, 1800, 3)).toBeCloseTo(base * 2, 10)
    expect(globeScreenRadius(44, 900, 6)).toBeCloseTo(base / 2, 10)
  })
})

describe('clampToGlobeEdge', () => {
  it('returns the point unchanged when it coincides with the center', () => {
    expect(clampToGlobeEdge(50, 50, 50, 50, 100)).toEqual([50, 50])
  })

  it('places the result at globeR * edgePadding from center, along the same direction', () => {
    const [sx, sy] = clampToGlobeEdge(200, 100, 50, 50, 40, 1.1)
    const dist = Math.hypot(sx - 50, sy - 50)
    expect(dist).toBeCloseTo(40 * 1.1, 10)
    // direction preserved: (sx - cx) / (sy - cy) matches the original ratio
    expect((sx - 50) / (sy - 50)).toBeCloseTo((200 - 50) / (100 - 50), 10)
  })

  it('defaults edgePadding to 1.1', () => {
    const withDefault = clampToGlobeEdge(200, 100, 50, 50, 40)
    const explicit = clampToGlobeEdge(200, 100, 50, 50, 40, 1.1)
    expect(withDefault).toEqual(explicit)
  })
})
