'use client'

import { WorldMap } from '@/components/stats/WorldMap'
import { StatCards } from '@/components/stats/StatCards'
import type { RoundResult } from '@/lib/game/types'
import type { CountryStat } from '@/components/stats/WorldMap'
import type { GeoCollection } from '@/lib/geo/types'

interface Props {
  results:    RoundResult[]
  elapsedMs?: number
  geo?:       GeoCollection
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function resultsToCountryStats(results: RoundResult[]): CountryStat[] {
  const map = new Map<string, CountryStat>()
  for (const r of results) {
    const existing = map.get(r.country) ?? { feature: r.country, correct: 0, wrong: 0, skipped: 0, avg_correct_ms: null }
    if (r.outcome === 'correct') {
      const prevAvg = existing.avg_correct_ms ?? 0
      const prevCount = existing.correct
      existing.avg_correct_ms = prevCount === 0 ? r.timeMs : Math.round((prevAvg * prevCount + r.timeMs) / (prevCount + 1))
      existing.correct++
    } else if (r.outcome === 'wrong') {
      existing.wrong++
    } else {
      existing.skipped++
    }
    map.set(r.country, existing)
  }
  return Array.from(map.values())
}

export function PracticeResults({ results, elapsedMs, geo }: Props) {
  const correct = results.filter(r => r.outcome === 'correct')
  const wrong   = results.filter(r => r.outcome === 'wrong').length
  const skipped = results.filter(r => r.outcome === 'skipped').length

  const gameStats = resultsToCountryStats(results)

  return (
    <>
      <StatCards stats={[
        { label: 'time', value: elapsedMs != null ? formatElapsed(elapsedMs) : '—' },
      ]} />

      <StatCards stats={[
        { label: 'correct', value: correct.length },
        { label: 'wrong',   value: wrong },
        { label: 'skipped', value: skipped },
      ]} />

      {/* Correct countries breakdown */}
      {correct.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <p className="px-5 pt-4 pb-2 text-xs font-semibold text-gray-400">Correct countries</p>
          <ul className="divide-y divide-gray-50">
            {correct.map((r, i) => (
              <li key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-gray-800">{r.country}</span>
                <span className="tabular-nums text-xs text-gray-400 shrink-0 ml-3">
                  {(r.timeMs / 1000).toFixed(1)}s
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Map — current game only */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        {geo ? (
          <WorldMap geo={geo} stats={gameStats} />
        ) : (
          <div className="w-full rounded-xl bg-gray-100 animate-pulse" style={{ paddingBottom: '52.5%' }} />
        )}
      </div>
    </>
  )
}
