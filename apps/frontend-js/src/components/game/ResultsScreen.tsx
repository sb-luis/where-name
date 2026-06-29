'use client'

import { useState, useCallback } from 'react'
import { PracticeResults } from './PracticeResults'
import { PlayResults } from './PlayResults'
import type { RoundResult } from '@/lib/game/types'
import type { CountryStat } from '@/components/stats/WorldMap'
import type { GeoCollection } from '@/lib/geo/types'

interface PracticeStatsResponse {
  games_played:    number
  games_completed: number
  countries:       CountryStat[]
}

interface Props {
  results:        RoundResult[]
  mode?:          'timed' | 'practice'
  elapsedMs?:     number
  geo?:           GeoCollection
  practiceStats?: PracticeStatsResponse
  onReturn:       () => void
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function ResultsScreen({ results, mode = 'timed', elapsedMs, geo, practiceStats, onReturn }: Props) {
  const [copied, setCopied] = useState(false)

  const handleShare = useCallback(async () => {
    const correct = results.filter(r => r.outcome === 'correct')
    const wrong   = results.filter(r => r.outcome === 'wrong').length
    const skipped = results.filter(r => r.outcome === 'skipped').length
    const lines = [
      `🌍 where.name — ${mode === 'practice' ? `practice (${elapsedMs != null ? formatElapsed(elapsedMs) : '?'})` : '1 min'}`,
      ``,
      `${correct.length} correct · ${skipped} skipped · ${wrong} wrong`,
      ``,
      ...correct.map(r => `${r.country} (${(r.timeMs / 1000).toFixed(1)}s)`),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable
    }
  }, [results, mode, elapsedMs])

  return (
    <main className="h-dvh overflow-y-auto bg-[#f3f3f3] px-4 py-5 md:px-6">
      <div className="max-w-2xl mx-auto space-y-4 pb-10">

        {/* Top bar */}
        <div className="w-full rounded-2xl bg-white shadow-sm border border-gray-100 px-5 py-3 flex items-center">
          <button
            onClick={onReturn}
            className="rounded-full px-4 py-1.5 text-sm font-semibold text-gray-600 bg-black/6 hover:bg-black/10 active:scale-95 transition-all duration-300 select-none"
          >
            where.name
          </button>
          <p className="flex-1 text-center text-sm font-semibold text-gray-500 uppercase tracking-widest">
            {mode === 'practice' ? 'Practice' : '1 minute'}
          </p>
          <button
            onClick={handleShare}
            className="rounded-full px-4 py-1.5 text-sm font-semibold text-gray-600 bg-black/6 hover:bg-black/10 active:scale-95 transition-all duration-300 select-none"
          >
            {copied ? 'copied!' : 'share'}
          </button>
        </div>

        {/* Mode-specific content */}
        {mode === 'practice' ? (
          <PracticeResults
            results={results}
            elapsedMs={elapsedMs}
            geo={geo}
            practiceStats={practiceStats}
          />
        ) : (
          <PlayResults results={results} />
        )}

      </div>
    </main>
  )
}
