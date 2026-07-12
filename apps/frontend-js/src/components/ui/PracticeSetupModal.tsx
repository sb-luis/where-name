'use client'

import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { PillGroup } from '@/components/ui/PillGroup'
import { useAuth } from '@/lib/auth/AuthContext'
import { useAchievements } from '@/lib/achievements/useAchievements'
import { CONTINENTS, type Continent } from '@/lib/game/countries'
import { DIFFICULTIES, type Difficulty } from '@/lib/game/types'

const TIME_STORAGE_KEY = 'practice_time_limit'
const DEFAULT_LIMIT_MS = 1 * 60 * 1000

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

const DIFFICULTY_STORAGE_KEY = 'practice_difficulty'
const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

export function loadPracticeDifficulty(): Difficulty {
  try {
    const raw = localStorage.getItem(DIFFICULTY_STORAGE_KEY)
    return (DIFFICULTIES as string[]).includes(raw ?? '') ? (raw as Difficulty) : 'easy'
  } catch {
    return 'easy'
  }
}

export function savePracticeDifficulty(difficulty: Difficulty) {
  try {
    localStorage.setItem(DIFFICULTY_STORAGE_KEY, difficulty)
  } catch {}
}

// max selectable difficulty = MIN unlock level across selected continents
function maxUnlockFor(continents: Continent[], unlocks: Record<Continent, Difficulty> | null): Difficulty {
  if (!unlocks || !continents.length) return 'easy'
  let maxRank = DIFFICULTIES.length - 1
  for (const c of continents) {
    const rank = DIFFICULTIES.indexOf(unlocks[c] ?? 'easy')
    if (rank < maxRank) maxRank = rank
  }
  return DIFFICULTIES[maxRank]
}

function limitingContinents(continents: Continent[], unlocks: Record<Continent, Difficulty> | null, maxAllowed: Difficulty): Continent[] {
  if (!unlocks) return []
  const maxRank = DIFFICULTIES.indexOf(maxAllowed)
  return continents.filter(c => DIFFICULTIES.indexOf(unlocks[c] ?? 'easy') === maxRank)
}

const pillBase = 'rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 select-none'
const pillActive   = `${pillBase} bg-gray-900 text-white cursor-pointer active:scale-95`
const pillInactive = `${pillBase} bg-black/6 text-gray-600 hover:bg-black/10 cursor-pointer active:scale-95`
const pillLocked   = `${pillBase} bg-black/6 text-gray-600 blur-[2.5px] cursor-not-allowed`

interface Props {
  onConfirm: (timeLimitMs: number | null, continents: Continent[], difficulty: Difficulty) => void
  onClose:   () => void
  onSignUp?: () => void
}

export function PracticeSetupModal({ onConfirm, onClose, onSignUp }: Props) {
  const { user }  = useAuth()
  const locked    = !user
  const { data: achievementsData } = useAchievements(!locked)
  const unlocks = achievementsData?.unlocks ?? null

  const [selectedTime, setSelectedTime]             = useState<number | null>(loadPracticeTimeLimit)
  const [selectedContinents, setSelectedContinents] = useState<Continent[]>(loadPracticeContinents)
  const [selectedDifficulty, setSelectedDifficulty] = useState<Difficulty>(loadPracticeDifficulty)

  const maxAllowed = useMemo(
    () => maxUnlockFor(selectedContinents, unlocks),
    [selectedContinents, unlocks],
  )

  // clamp to the group-min-unlock ceiling whenever continent changes make the pick unreachable
  const effectiveDifficulty = DIFFICULTIES.indexOf(selectedDifficulty) > DIFFICULTIES.indexOf(maxAllowed)
    ? maxAllowed
    : selectedDifficulty

  const toggleContinent = (continent: Continent) => {
    setSelectedContinents(prev =>
      prev.includes(continent) ? prev.filter(c => c !== continent) : [...prev, continent]
    )
  }

  const lockedHint = useMemo(() => {
    if (maxAllowed === 'hard' || !unlocks) return null
    const blockers = limitingContinents(selectedContinents, unlocks, maxAllowed).slice(0, 2)
    if (!blockers.length) return null
    const nextLocked = DIFFICULTIES[DIFFICULTIES.indexOf(maxAllowed) + 1]
    return `${DIFFICULTY_LABELS[nextLocked]} locked — ${blockers.map(c => CONTINENT_LABELS[c]).join(', ')} ${blockers.length > 1 ? 'are' : 'is'} only unlocked to ${DIFFICULTY_LABELS[maxAllowed]}`
  }, [maxAllowed, selectedContinents, unlocks])

  const handleConfirm = () => {
    if (locked) {
      onConfirm(DEFAULT_LIMIT_MS, [...CONTINENTS], 'easy')
      return
    }
    if (!selectedContinents.length) return
    savePracticeTimeLimit(selectedTime)
    savePracticeContinents(selectedContinents)
    savePracticeDifficulty(effectiveDifficulty)
    onConfirm(selectedTime, selectedContinents, effectiveDifficulty)
  }

  return (
    <Modal className="px-7 py-6 mx-6 w-full max-w-md space-y-5" onClose={onClose}>
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Practice</p>
        <p className={`text-base font-bold text-gray-900 ${locked ? 'line-through decoration-2' : ''}`}>
          set a time limit
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {OPTIONS.map(opt => (
          <button
            key={String(opt.ms)}
            onClick={() => !locked && setSelectedTime(opt.ms)}
            disabled={locked}
            className={locked ? pillLocked : selectedTime === opt.ms ? pillActive : pillInactive}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <p className={`text-base font-bold text-gray-900 ${locked ? 'line-through decoration-2' : ''}`}>
          choose continents
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CONTINENTS.map(continent => (
          <button
            key={continent}
            onClick={() => !locked && toggleContinent(continent)}
            disabled={locked}
            className={locked ? pillLocked : selectedContinents.includes(continent) ? pillActive : pillInactive}
          >
            {CONTINENT_LABELS[continent]}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <p className={`text-base font-bold text-gray-900 ${locked ? 'line-through decoration-2' : ''}`}>
          difficulty
        </p>
      </div>

      <div className="space-y-1.5">
        <PillGroup
          options={DIFFICULTIES.map(d => ({
            value: d,
            label: DIFFICULTY_LABELS[d],
            disabled: DIFFICULTIES.indexOf(d) > DIFFICULTIES.indexOf(maxAllowed),
          }))}
          selected={effectiveDifficulty}
          onSelect={setSelectedDifficulty}
          locked={locked}
        />
        {!locked && lockedHint && (
          <p className="text-xs text-gray-400">{lockedHint}</p>
        )}
      </div>

      {locked ? (
        <Button
          variant="secondary"
          className="w-full mb-3"
          onClick={() => { onClose(); onSignUp?.() }}
        >
          sign up to customize
        </Button>
      ) : !selectedContinents.length && (
        <p className="text-xs text-red-500">select at least one continent</p>
      )}

      <Button className="w-full" onClick={handleConfirm} disabled={!locked && !selectedContinents.length}>
        start
      </Button>
    </Modal>
  )
}
