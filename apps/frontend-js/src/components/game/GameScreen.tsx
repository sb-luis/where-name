'use client'

import { useRef } from 'react'
import NumberFlow from '@number-flow/react'
import { MultiplayerGlobe } from '@/components/multiplayer/MultiplayerGlobe'
import type { MultiplayerGlobeHandle } from '@/components/multiplayer/MultiplayerGlobe'
import { DIFFICULTY_LOD_LEVEL } from '@/lib/game/difficulty'
import { useGameRound } from '@/lib/game/useGameRound'
import type { RoundResult, Difficulty } from '@/lib/game/types'
import type { CursorData } from '@/lib/multiplayer/types'

interface Props {
  targets:                string[]
  practice?:              boolean
  practiceTimeLimitMs?:   number | null
  difficulty?:            Difficulty
  cursors?:               CursorData[]
  initialPosition?:       { lat: number; lng: number }
  onCursorMove?:          (lat: number, lng: number) => void
  onCameraChange?:        (lat: number, lng: number) => void
  onEnd:                  (results: RoundResult[], elapsedMs?: number) => void
  onQuit?:                () => void  // if provided, Quit goes here instead of onEnd (play mode: back to home)
}

export function GameScreen({ targets, practice = false, practiceTimeLimitMs = null, difficulty = 'easy', cursors = [], initialPosition, onCursorMove, onCameraChange, onEnd, onQuit }: Props) {
  const globeRef = useRef<MultiplayerGlobeHandle>(null)

  const {
    displaySeconds,
    feedback,
    isLive,
    practiceCountdown,
    country,
    handleSkip,
    handleQuit,
    handleSelect,
  } = useGameRound({ targets, practice, practiceTimeLimitMs, globeRef, onEnd, onQuit })

  // Derive left-column display
  const isFeedback     = feedback !== null
  const leftLabel      = isFeedback ? 'You clicked' : 'Find'
  const leftCountry    = isFeedback ? (feedback.clicked ?? country) : country
  const leftCountryClr = isFeedback
    ? (feedback.correct ? 'text-emerald-500' : 'text-rose-400')
    : 'text-gray-800'

  return (
    <div className="relative w-screen h-dvh">
      <MultiplayerGlobe
        ref={globeRef}
        onSelect={handleSelect}
        onCursorMove={onCursorMove}
        onCameraChange={onCameraChange}
        cursors={cursors}
        currentStatus={practice ? 'practice' : 'playing'}
        initialPosition={initialPosition}
        showLabel={false}
        interactive={isLive}
        minLodLevel={DIFFICULTY_LOD_LEVEL[difficulty]}
      />

      {/* HUD */}
      <div className="pointer-events-none absolute top-5 inset-x-0 px-4 md:px-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-2">

        {/* Controls card */}
        <div className="pointer-events-auto w-full rounded-2xl bg-white/90 backdrop-blur-sm shadow px-5 py-3 flex items-center">
          <div className="flex items-center gap-2">
            <button
              onClick={handleQuit}
              className="rounded-full px-4 py-1.5 text-sm font-semibold
                transition-all duration-300 select-none
                bg-black/6 text-gray-600 cursor-pointer hover:bg-black/10 active:scale-95"
            >
              {practice ? 'stop' : 'quit'}
            </button>
            <button
              onClick={handleSkip}
              disabled={!isLive}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold
                transition-all duration-300 select-none
                ${isLive
                  ? 'bg-black/6 text-gray-600 cursor-pointer hover:bg-black/10 active:scale-95'
                  : 'bg-black/4 text-gray-300 cursor-default'
                }`}
            >
              skip
            </button>
          </div>
          <p className="flex-1 text-center text-sm font-semibold text-gray-500 uppercase tracking-widest">
            {practice ? 'Practice' : '1 minute'}
          </p>
          <div className="flex items-center gap-2.5">
            <span className={`text-sm font-semibold tabular-nums transition-colors duration-300 ${
              !isLive
                ? 'text-gray-300'
                : (practiceCountdown || !practice) && displaySeconds <= 10
                  ? 'text-rose-400'
                  : 'text-gray-500'
            }`}>
              {displaySeconds >= 60
                ? <><NumberFlow value={Math.floor(displaySeconds / 60)} />m <NumberFlow value={displaySeconds % 60} />s</>
                : <><NumberFlow value={displaySeconds} />s</>
              }
            </span>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 active:scale-95 transition-all duration-150 text-xl"
              onClick={() => globeRef.current?.reset()}
              title="Reset view"
            >
              🌍
            </button>
          </div>
        </div>

        {/* Country prompt card */}
        <div key={`${leftLabel}-${leftCountry}`} className="pointer-events-auto anim-fade-up w-full rounded-2xl bg-white/90 backdrop-blur-sm shadow px-5 py-3 flex flex-col gap-0.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 leading-none">
            {leftLabel}
          </p>
          <p className={`text-xl font-bold leading-tight transition-colors duration-300 ${leftCountryClr}`}>
            {leftCountry}
          </p>
        </div>

        </div>
      </div>
    </div>
  )
}
