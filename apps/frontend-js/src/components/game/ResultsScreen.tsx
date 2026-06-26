'use client'

import { useEffect, useState, useCallback } from 'react'
import NumberFlow from '@number-flow/react'
import type { RoundResult } from '@/lib/game/types'

interface Props {
  results:         RoundResult[]
  mode?:           'timed' | 'practice'
  elapsedSeconds?: number
  onReturn:      () => void
}

function formatElapsed(s: number): string {
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export function ResultsScreen({ results, mode = 'timed', elapsedSeconds, onReturn }: Props) {
  const correct = results.filter(r => r.outcome === 'correct').length
  const skipped = results.filter(r => r.outcome === 'skipped').length
  const wrong   = results.filter(r => r.outcome === 'wrong').length

  const [displayScore, setDisplayScore] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDisplayScore(correct), 150)
    return () => clearTimeout(t)
  }, [correct])

  const handleShare = useCallback(async () => {
    const correctItems = results.filter(r => r.outcome === 'correct')
    const lines = [
      `🌍 where in world? — ${mode === 'practice' ? `practice (${elapsedSeconds != null ? formatElapsed(elapsedSeconds) : '?'})` : '1 min'}`,
      ``,
      `${correct} correct · ${skipped} skipped · ${wrong} wrong`,
      ``,
      ...correctItems.map(r => `${r.country} (${((r.timeMs ?? 0) / 1000).toFixed(1)}s)`),
    ]
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable
    }
  }, [results, correct, skipped, wrong])

  return (
    <main className="w-screen h-dvh bg-[#f3f3f3] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 w-full max-w-sm">

        {/* Score */}
        <div className="text-center pb-6 border-b border-gray-100">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-3">
            {mode === 'practice' ? 'Practice' : '1 minute'}
          </p>
          <div className="text-5xl font-black text-gray-900 tabular-nums">
            <NumberFlow value={displayScore} />
          </div>
          <p className="text-base text-gray-400 mt-1">
            {correct === 1 ? 'country' : 'countries'} guessed
          </p>
          {(skipped > 0 || wrong > 0) && (
            <p className="text-sm text-gray-300 mt-2 tabular-nums">
              {skipped > 0 && `${skipped} skipped`}
              {skipped > 0 && wrong > 0 && ' · '}
              {wrong > 0 && `${wrong} wrong`}
            </p>
          )}
        </div>

        {/* Country list */}
        <ul className="py-4 space-y-1 max-h-64 overflow-y-auto pr-2">
          {results.map((r, i) => (
            <li key={i} className="flex items-center justify-between py-1 text-sm">
              <span className={r.outcome === 'correct' ? 'text-gray-800' : 'text-gray-300'}>
                {r.country}
              </span>
              <span className={`tabular-nums text-xs shrink-0 ml-3 ${r.outcome === 'correct' ? 'text-gray-400' : 'text-gray-200'}`}>
                {r.outcome === 'correct'
                  ? `${((r.timeMs ?? 0) / 1000).toFixed(1)}s`
                  : r.outcome === 'skipped' ? 'skip' : '✗'}
              </span>
            </li>
          ))}
        </ul>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-100">
          <button
            onClick={handleShare}
            className="flex-1 py-2.5 rounded-full border border-gray-200 text-gray-500 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            {copied ? 'copied!' : 'share'}
          </button>
          <button
            onClick={onReturn}
            className="flex-1 py-2.5 rounded-full bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 active:scale-95 transition-all duration-150"
          >
            back 
          </button>
        </div>

      </div>
    </main>
  )
}
