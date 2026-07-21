import { describe, it, expect } from 'vitest'
import { latLngToCameraPos, latLonToVec3, vec3ToLatLon } from './geometry'
import * as THREE from 'three'

describe('latLngToCameraPos', () => {
  it('matches latLonToVec3 at the given distance', () => {
    const [x, y, z] = latLngToCameraPos(12, -34, 3)
    const v = latLonToVec3(12, -34, 3)
    expect([x, y, z]).toEqual([v.x, v.y, v.z])
  })

  it('scales linearly with distance', () => {
    const near = latLngToCameraPos(20, 50, 1)
    const far = latLngToCameraPos(20, 50, 5)
    expect(far).toEqual(near.map(n => n * 5))
  })

  it('round-trips through vec3ToLatLon back to the original lat/lng', () => {
    const cases: Array<[number, number]> = [[0, 0], [45, 90], [-30, -120], [89, 179]]
    for (const [lat, lng] of cases) {
      const [x, y, z] = latLngToCameraPos(lat, lng, 3)
      const { lat: outLat, lon: outLng } = vec3ToLatLon(new THREE.Vector3(x, y, z).normalize())
      expect(outLat).toBeCloseTo(lat, 5)
      expect(outLng).toBeCloseTo(lng, 5)
    }
  })
})
