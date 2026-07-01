'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { CONTINENTS, type Continent } from '@/lib/game/countries'

const TIME_STORAGE_KEY = 'practice_time_limit'
const DEFAULT_LIMIT_MS = 15 * 60 * 1000

// minutes → ms, null = no limit
const OPTIONS: { label: string; ms: number | null }[] = [
  { label: '1m',       ms:  1 * 60 * 1000 },
  { label: '2m',       ms:  2 * 60 * 1000 },
  { label: '3m',       ms:  3 * 60 * 1000 },
  { label: '5m',       ms:  5 * 60 * 1000 },
  { label: '10m',      ms: 10 * 60 * 1000 },
  { label: '15m',      ms: 15 * 60 * 1000 },
  { label: '20m',      ms: 20 * 60 * 1000 },
  { label: '30m',      ms: 30 * 60 * 1000 },
  { label: 'no limit', ms: null },
]

const CONTINENT_STORAGE_KEY = 'practice_continents'

const CONTINENT_LABELS: Record<Continent, string> = {
  'Africa':          'Africa',
  'Antarctica':      'Antarctica',
  'Asia':            'Asia',
  'Europe':          'Europe',
  'North America':   'North America',
  'Oceania':         'Oceania',
  'South America':   'South America',
}

export function loadPracticeTimeLimit(): number | null {
  try {
    const raw = localStorage.getItem(TIME_STORAGE_KEY)
    if (raw === null) return DEFAULT_LIMIT_MS
    if (raw === 'null') return null
    const n = Number(raw)
    return isNaN(n) ? DEFAULT_LIMIT_MS : n
  } catch {
    return DEFAULT_LIMIT_MS
  }
}

export function savePracticeTimeLimit(ms: number | null) {
  try {
    localStorage.setItem(TIME_STORAGE_KEY, ms === null ? 'null' : String(ms))
  } catch {}
}

export function loadPracticeContinents(): Continent[] {
  try {
    const raw = localStorage.getItem(CONTINENT_STORAGE_KEY)
    if (raw === null) return [...CONTINENTS]
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...CONTINENTS]
    const valid = parsed.filter((c): c is Continent => (CONTINENTS as readonly string[]).includes(c))
    return valid.length ? valid : [...CONTINENTS]
  } catch {
    return [...CONTINENTS]
  }
}

export function savePracticeContinents(continents: Continent[]) {
  try {
    localStorage.setItem(CONTINENT_STORAGE_KEY, JSON.stringify(continents))
  } catch {}
}

interface Props {
  onConfirm: (timeLimitMs: number | null, continents: Continent[]) => void
  onClose:   () => void
}

export function PracticeSetupModal({ onConfirm, onClose }: Props) {
  const [selectedTime, setSelectedTime]             = useState<number | null>(loadPracticeTimeLimit)
  const [selectedContinents, setSelectedContinents] = useState<Continent[]>(loadPracticeContinents)

  const toggleContinent = (continent: Continent) => {
    setSelectedContinents(prev =>
      prev.includes(continent) ? prev.filter(c => c !== continent) : [...prev, continent]
    )
  }

  const handleConfirm = () => {
    if (!selectedContinents.length) return
    savePracticeTimeLimit(selectedTime)
    savePracticeContinents(selectedContinents)
    onConfirm(selectedTime, selectedContinents)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl shadow-lg px-7 py-6 w-full max-w-xs space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors text-xl leading-none cursor-pointer"
          aria-label="Close"
        >
          ×
        </button>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Practice</p>
          <p className="text-base font-bold text-gray-900">set a time limit</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {OPTIONS.map(opt => (
            <button
              key={String(opt.ms)}
              onClick={() => setSelectedTime(opt.ms)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 active:scale-95 cursor-pointer select-none ${
                selectedTime === opt.ms
                  ? 'bg-gray-900 text-white'
                  : 'bg-black/6 text-gray-600 hover:bg-black/10'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <p className="text-base font-bold text-gray-900">choose continents</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {CONTINENTS.map(continent => (
            <button
              key={continent}
              onClick={() => toggleContinent(continent)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 active:scale-95 cursor-pointer select-none ${
                selectedContinents.includes(continent)
                  ? 'bg-gray-900 text-white'
                  : 'bg-black/6 text-gray-600 hover:bg-black/10'
              }`}
            >
              {CONTINENT_LABELS[continent]}
            </button>
          ))}
        </div>

        {!selectedContinents.length && (
          <p className="text-xs text-red-500">select at least one continent</p>
        )}

        <Button className="w-full" onClick={handleConfirm} disabled={!selectedContinents.length}>
          start
        </Button>
      </div>
    </div>
  )
}
