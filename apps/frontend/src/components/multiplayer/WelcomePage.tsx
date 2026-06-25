'use client'

import { useEffect, useRef, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { PresenceGlobe } from './PresenceGlobe'
import type { CursorData } from '@/lib/multiplayer/types'

interface Props {
  onStart:          () => void
  onPractice?:      () => void
  onExplore?:       () => void
  loading?:         boolean
  countryCount?:    number
  cursors?:         CursorData[]
  initialPosition?: { lat: number; lng: number }
  onCursorMove?:    (lat: number, lng: number) => void
  onCameraChange?:  (lat: number, lng: number) => void
}

function formatMs(ms: number): { value: number; unit: string } {
  if (ms >= 1000) return { value: parseFloat((ms / 1000).toFixed(2)), unit: 's' }
  return { value: ms, unit: 'ms' }
}

export function WelcomePage({
  onStart,
  onPractice,
  onExplore,
  loading = false,
  countryCount = 0,
  cursors = [],
  initialPosition,
  onCursorMove,
  onCameraChange,
}: Props) {
  const startRef      = useRef(0)
  const alreadyLoaded = useRef(!loading)

  useEffect(() => { startRef.current = performance.now() }, [])

  const [liveMs, setLiveMs]               = useState(0)
  const [fetchMs, setFetchMs]             = useState<number | null>(null)
  const [animatedCount, setAnimatedCount] = useState(0)

  useEffect(() => {
    if (alreadyLoaded.current || !loading) return
    const id = setInterval(
      () => setLiveMs(Math.round(performance.now() - startRef.current)),
      80,
    )
    return () => clearInterval(id)
  }, [loading])

  useEffect(() => {
    if (alreadyLoaded.current) return
    if (!loading && countryCount > 0 && fetchMs === null)
      setFetchMs(Math.round(performance.now() - startRef.current))
  }, [loading, countryCount, fetchMs])

  useEffect(() => {
    if (countryCount > 0) setAnimatedCount(countryCount)
  }, [countryCount])

  const displayMs = fetchMs ?? liveMs
  const { value: fetchValue, unit: fetchUnit } = formatMs(displayMs)
  const loaded = !loading && countryCount > 0

  return (
    <main className="w-screen h-dvh bg-[#f3f3f3] flex flex-col items-center justify-between py-12 px-6">

      {/* ── Title ── */}
      <div className="text-center space-y-2">
        {loading ? (
          <>
            <p className="text-lg text-gray-600 font-medium">world is loading</p>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-gray-900 tabular-nums whitespace-nowrap">
              <NumberFlow value={fetchValue} format={{ maximumFractionDigits: 2 }} /><span className="ml-1">{fetchUnit}</span>
            </h1>
          </>
        ) : (
          <>
            <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-gray-900 tabular-nums whitespace-nowrap">
              <NumberFlow value={animatedCount} /> countries ready
            </h1>
            <p className="text-base text-gray-400">
              how many can you guess in 1 minute?
            </p>
          </>
        )}
      </div>

      {/* ── Presence Globe ── */}
      <div className="flex-1 w-full flex items-center justify-center">
        <div
          className="aspect-square"
          style={{
            width: 'min(75vw, 52vh)',
            filter: 'drop-shadow(0 16px 40px rgba(66,124,223,0.18)) drop-shadow(0 4px 12px rgba(0,0,0,0.08))',
          }}
        >
          <PresenceGlobe cursors={cursors} currentStatus="home" initialPosition={initialPosition} onCursorMove={onCursorMove} onCameraChange={onCameraChange} />
        </div>
      </div>

      {/* ── CTA ── */}
      <div className={`w-full max-w-xs shrink-0 transition-all duration-500 ${
        loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}>
        <div className="flex flex-col gap-2">
          <button
            onClick={onStart}
            className="w-full py-3 rounded-full bg-gray-900 text-white font-semibold text-base hover:bg-gray-700 active:scale-95 transition-all duration-150"
          >
            play 
          </button>
          {(onPractice || onExplore) && (
            <div className="flex gap-2">
              {onPractice && (
                <button
                  onClick={onPractice}
                  className="flex-1 py-3 rounded-full border border-gray-200 text-gray-500 font-medium text-base hover:bg-gray-50 active:scale-95 transition-all duration-150"
                >
                  practice
                </button>
              )}
              {onExplore && (
                <button
                  onClick={onExplore}
                  className="flex-1 py-3 rounded-full border border-gray-200 text-gray-500 font-medium text-base hover:bg-gray-50 active:scale-95 transition-all duration-150"
                >
                  explore
                </button>
              )}
            </div>
          )}
        </div>
      </div>

    </main>
  )
}
