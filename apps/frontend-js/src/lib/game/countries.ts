import { useEffect, useState } from 'react'
import { useGeoData } from '@/lib/geo/GeoDataContext'
import { LEVELS } from '@/lib/geo/lod'
import type { GeoCollection } from '@/lib/geo/types'

function extractNames(geojson: GeoCollection): string[] {
  const seen = new Set<string>()
  for (const feature of geojson.features) {
    const name = feature.properties?.NAME ?? feature.properties?.ADMIN
    if (name) seen.add(String(name))
  }
  return [...seen]
}

// Starts loading the 110m dataset in the background and returns the name list
// once ready. Returns an empty array while loading — callers should disable
// any "start" action until the array is non-empty.
export function useCountryNames(): string[] {
  const { loadCollection } = useGeoData()
  const [names, setNames] = useState<string[]>([])

  useEffect(() => {
    // we will use only the 110m dataet for prompting
    loadCollection(LEVELS[0].url).then(geojson => setNames(extractNames(geojson)))
  }, [loadCollection])

  return names
}

export function pickRandom(names: string[], n: number): string[] {
  const arr = [...names]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, n)
}
