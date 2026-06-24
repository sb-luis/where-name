'use client'

import { useEffect, useRef, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { PresenceGlobe } from './PresenceGlobe'
import { AliasSelect } from './AliasSelect'
import type { CursorData } from '@/lib/multiplayer/types'

interface Props {
  onStart:       () => void
  loading?:      boolean
  countryCount?: number
  alias:         string | null
  onAliasSubmit: (alias: string) => void
  cursors?:      CursorData[]
  onCursorMove?: (lat: number, lng: number) => void
}

function formatMs(ms: number): { value: number; unit: string } {
  if (ms >= 1000) return { value: parseFloat((ms / 1000).toFixed(2)), unit: 's' }
  return { value: ms, unit: 'ms' }
}

export function WelcomePage({
  onStart,
  loading = false,
  countryCount = 0,
  alias,
  onAliasSubmit,
  cursors = [],
  onCursorMove,
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
      <div className="text-center shrink-0">
        {loading ? (
          <div key="loading" className="anim-fade-up">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-2">
              world is loading
            </p>
            <h1 className="text-5xl font-black tracking-tight text-gray-900 tabular-nums">
              <NumberFlow value={fetchValue} format={{ maximumFractionDigits: 2 }} />
              <span className="text-3xl ml-1.5 font-bold">{fetchUnit}</span>
            </h1>
          </div>
        ) : (
          <div key="ready" className="anim-fade-up">
            <h1 className="text-5xl font-black tracking-tight text-gray-900 tabular-nums">
              <NumberFlow value={animatedCount} />
              <span className="ml-2">countries</span>
            </h1>
            <p className="text-base text-gray-400 mt-2">
              how many can you guess in 1 minute?
            </p>
          </div>
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
          <PresenceGlobe cursors={cursors} onCursorMove={onCursorMove} />
        </div>
      </div>

      {/* ── CTA ── */}
      <div className={`w-full max-w-xs shrink-0 transition-all duration-500 ${
        loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}>
        {alias ? (
          <button
            onClick={onStart}
            className="w-full py-3 rounded-full bg-gray-900 text-white font-semibold text-base hover:bg-gray-700 active:scale-95 transition-all duration-150"
          >
            Start Game
          </button>
        ) : (
          <AliasSelect onSubmit={onAliasSubmit} />
        )}
      </div>

    </main>
  )
}
