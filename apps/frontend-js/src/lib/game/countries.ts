import { useEffect, useState } from 'react'
import { useGeoData } from '@/lib/geo/GeoDataContext'
import { LEVELS } from '@/lib/geo/lod'
import type { GeoCollection } from '@/lib/geo/types'

// Natural Earth's CONTINENT property values, as found in the bundled
// ne_*_admin_0_countries datasets — minus "Seven seas (open ocean)", whose
// features are reassigned below since it isn't a real continent.
//
// Ordered by when humans first reached each continent, rather than
// alphabetically or by size, so nothing gets top billing just by
// convention: Africa (origin, ~300kya) -> Asia (~70-60kya, "out of
// Africa") -> Oceania (~65-50kya, via Southeast Asia) -> Europe (~45-40kya,
// Cro-Magnons) -> North America (~20-15kya, via the Beringia land bridge)
// -> South America (~14.5kya, migrating south from North America) ->
// Antarctica (no prehistoric habitation; first sighted 1820, first landed
// 1821 — millennia after every other continent).
export const CONTINENTS = [
  'Africa',
  'Asia',
  'Oceania',
  'Europe',
  'North America',
  'South America',
  'Antarctica',
] as const

export type Continent = typeof CONTINENTS[number]

// Natural Earth buckets small/remote territories under CONTINENT
// "Seven seas (open ocean)" instead of a real continent. We reassign each
// by its actual geography so every feature still lands in a selectable
// continent. Keyed by NAME as it appears in the ne_*_admin_0_countries data.
const SEVEN_SEAS_OVERRIDES: Record<string, Continent> = {
  'Seychelles':               'Africa',       // Indian Ocean, off East Africa
  'Saint Helena':             'Africa',       // South Atlantic, off West Africa
  'Mauritius':                'Africa',       // Indian Ocean, off East Africa
  'Maldives':                 'Asia',         // Indian Ocean, south of India
  'Br. Indian Ocean Ter.':    'Asia',         // Chagos, closer to the Maldives than to Africa
  'Clipperton I.':            'North America',// Pacific atoll off Mexico
  'Fr. S. Antarctic Lands':   'Antarctica',   // sub-Antarctic islands, southern Indian Ocean
  'Heard I. and McDonald Is.':'Antarctica',   // sub-Antarctic, despite Australian sovereignty
  'S. Geo. and the Is.':      'Antarctica',   // South Georgia, sub-Antarctic South Atlantic
}

export interface CountryEntry {
  name: string
  continent: string
}

function extractCountries(geojson: GeoCollection): CountryEntry[] {
  const seen = new Map<string, string>()
  for (const feature of geojson.features) {
    const name = feature.properties?.NAME ?? feature.properties?.ADMIN
    let continent = feature.properties?.CONTINENT
    if (continent === 'Seven seas (open ocean)' && name) {
      continent = SEVEN_SEAS_OVERRIDES[String(name)] ?? continent
    }
    if (name && continent && !seen.has(String(name))) seen.set(String(name), String(continent))
  }
  return [...seen].map(([name, continent]) => ({ name, continent }))
}

// Starts loading the 110m dataset in the background and returns the country
// list once ready. Returns an empty array while loading — callers should
// disable any "start" action until the array is non-empty.
export function useCountryEntries(): CountryEntry[] {
  const { loadCollection } = useGeoData()
  const [entries, setEntries] = useState<CountryEntry[]>([])

  useEffect(() => {
    // we will use only the 110m dataet for prompting
    loadCollection(LEVELS[0].url).then(geojson => setEntries(extractCountries(geojson)))
  }, [loadCollection])

  return entries
}

export function filterByContinents(entries: CountryEntry[], continents: readonly string[]): string[] {
  const allowed = new Set(continents)
  return entries.filter(e => allowed.has(e.continent)).map(e => e.name)
}

export function pickRandom(names: string[], n: number): string[] {
  const arr = [...names]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, n)
}
