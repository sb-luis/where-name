#!/usr/bin/env node
// Builds a shared country/continent manifest from Natural Earth GeoJSONs
// for use by both the frontend and backend.

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const BASE_URL = 'https://natural-earth-cdn.luis-sb.workers.dev'

const ORDER = ['easy', 'medium', 'hard']

const SOURCES = [
  { difficulty: 'easy', url: `${BASE_URL}/110m/cultural/ne_110m_admin_0_countries.geojson` },
  { difficulty: 'medium', url: `${BASE_URL}/50m/cultural/ne_50m_admin_0_countries.geojson` },
  { difficulty: 'hard', url: `${BASE_URL}/10m/cultural/ne_10m_admin_0_countries.geojson` },
]

const CONTINENTS = [
  'Africa',
  'Asia',
  'Oceania',
  'Europe',
  'North America',
  'South America',
  'Antarctica',
]

// Mirrors SEVEN_SEAS_OVERRIDES in apps/frontend-js/src/lib/game/countries.ts
const SEVEN_SEAS_OVERRIDES = {
  'Seychelles': 'Africa',
  'Saint Helena': 'Africa',
  'Mauritius': 'Africa',
  'Maldives': 'Asia',
  'Br. Indian Ocean Ter.': 'Asia',
  'Clipperton I.': 'North America',
  'Fr. S. Antarctic Lands': 'Antarctica',
  'Heard I. and McDonald Is.': 'Antarctica',
  'S. Geo. and the Is.': 'Antarctica',
}

async function fetchGeoJson(url) {
  // CDN worker rejects requests without an allowed Origin
  const res = await fetch(url, { headers: { Origin: 'http://localhost:3000' } })
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return res.json()
}

function extractCountries(geojson) {
  const seen = new Map()
  const unmappedSevenSeas = new Set()
  for (const feature of geojson.features) {
    const name = feature.properties?.NAME ?? feature.properties?.ADMIN
    let continent = feature.properties?.CONTINENT
    if (continent === 'Seven seas (open ocean)' && name) {
      const override = SEVEN_SEAS_OVERRIDES[String(name)]
      if (override) {
        continent = override
      } else {
        unmappedSevenSeas.add(String(name))
      }
    }
    if (name && continent && !seen.has(String(name))) seen.set(String(name), String(continent))
  }
  return { entries: [...seen].map(([name, continent]) => ({ name, continent })), unmappedSevenSeas }
}

function groupByContinent(entries) {
  const byContinent = {}
  for (const continent of CONTINENTS) byContinent[continent] = []
  for (const { name, continent } of entries) {
    if (!byContinent[continent]) byContinent[continent] = []
    byContinent[continent].push(name)
  }
  for (const continent of Object.keys(byContinent)) byContinent[continent].sort((a, b) => a.localeCompare(b))
  return byContinent
}

// name -> continent, across all difficulties (for consistency assertion)
function collectNameContinents(fullSets) {
  const nameContinent = new Map()
  const conflicts = []
  for (const difficulty of ORDER) {
    for (const continent of CONTINENTS) {
      for (const name of fullSets[difficulty][continent]) {
        const prior = nameContinent.get(name)
        if (prior && prior !== continent) {
          conflicts.push(`${name}: ${prior} (earlier) vs ${continent} (${difficulty})`)
        } else {
          nameContinent.set(name, continent)
        }
      }
    }
  }
  return { nameContinent, conflicts }
}

function assertNesting(fullSets) {
  for (let i = 0; i < ORDER.length - 1; i++) {
    const lower = ORDER[i]
    const upper = ORDER[i + 1]
    const upperNames = new Set()
    for (const continent of CONTINENTS) for (const name of fullSets[upper][continent]) upperNames.add(name)
    const missing = []
    for (const continent of CONTINENTS) {
      for (const name of fullSets[lower][continent]) {
        if (!upperNames.has(name)) missing.push(name)
      }
    }
    if (missing.length > 0) {
      throw new Error(`Nesting violation: ${lower} has names missing from ${upper}: ${missing.join(', ')}`)
    }
  }
}

function computeDeltas(fullSets) {
  const deltas = {}
  const seenSoFar = new Set()
  for (const difficulty of ORDER) {
    const byContinent = {}
    for (const continent of CONTINENTS) {
      const names = fullSets[difficulty][continent].filter(name => !seenSoFar.has(name))
      byContinent[continent] = names
    }
    for (const continent of CONTINENTS) for (const name of fullSets[difficulty][continent]) seenSoFar.add(name)
    deltas[difficulty] = byContinent
  }
  return deltas
}

async function main() {
  const fullSets = {}

  for (const { difficulty, url } of SOURCES) {
    const geojson = await fetchGeoJson(url)
    const { entries, unmappedSevenSeas } = extractCountries(geojson)
    if (unmappedSevenSeas.size > 0) {
      console.warn(
        `Warning: "Seven seas (open ocean)" features without an override: ${[...unmappedSevenSeas].join(', ')}`
      )
    }
    fullSets[difficulty] = groupByContinent(entries)
  }

  assertNesting(fullSets)

  const { conflicts } = collectNameContinents(fullSets)
  if (conflicts.length > 0) {
    throw new Error(`Continent-consistency violations:\n${conflicts.join('\n')}`)
  }

  const deltas = computeDeltas(fullSets)

  const canonical = JSON.stringify(deltas)
  const version = createHash('sha256').update(canonical).digest('hex').slice(0, 12)

  const manifest = { version, order: ORDER, continents: CONTINENTS, difficulties: deltas }
  const json = JSON.stringify(manifest, null, 2) + '\n'

  const outputs = [
    path.join(ROOT, 'apps/frontend-js/src/lib/geo/geo-manifest.json'),
    path.join(ROOT, 'apps/backend-go/internal/geo/manifest.json'),
  ]

  for (const outputPath of outputs) {
    await mkdir(path.dirname(outputPath), { recursive: true })
    await writeFile(outputPath, json)
  }

  console.log(`Manifest version: ${version}`)
  const cumulativeTotals = {}
  for (const difficulty of ORDER) {
    let deltaTotal = 0
    console.log(`\n${difficulty} (delta):`)
    for (const continent of CONTINENTS) {
      const count = deltas[difficulty][continent].length
      deltaTotal += count
      console.log(`  ${continent}: ${count}`)
    }
    console.log(`  delta total: ${deltaTotal}`)
    let cumulativeTotal = 0
    for (const continent of CONTINENTS) cumulativeTotal += fullSets[difficulty][continent].length
    cumulativeTotals[difficulty] = cumulativeTotal
  }
  console.log(`\nCumulative totals: ${ORDER.map(d => `${d}=${cumulativeTotals[d]}`).join(', ')}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
