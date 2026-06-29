'use client'

import { useEffect, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { PresenceGlobe } from './PresenceGlobe'
import { Button } from '@/components/ui/Button'
import { Header } from '@/components/ui/Header'
import { Footer } from '@/components/ui/Footer'
import { AuthButton } from '@/components/auth/AuthButton'
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
  // Captured synchronously at mount — no effect needed, no risk of a
  // stale-zero if the interval fires before useEffect runs.
  const [loadStartMs] = useState(() => performance.now())

  const [liveMs, setLiveMs]               = useState(0)
  const [fetchMs, setFetchMs]             = useState<number | null>(null)
  const [animatedCount, setAnimatedCount] = useState(0)

  useEffect(() => {
    if (!loading) return
    const id = setInterval(
      () => setLiveMs(Math.round(performance.now() - loadStartMs)),
      80,
    )
    return () => clearInterval(id)
  }, [loading, loadStartMs])

  useEffect(() => {
    if (!loading && countryCount > 0 && fetchMs === null)
      setFetchMs(Math.round(performance.now() - loadStartMs))
  }, [loading, countryCount, fetchMs, loadStartMs])

  useEffect(() => {
    if (countryCount > 0) setAnimatedCount(countryCount)
  }, [countryCount])

  const displayMs = fetchMs ?? liveMs
  const { value: fetchValue, unit: fetchUnit } = formatMs(displayMs)
  const loaded = !loading && countryCount > 0

  return (
    <div className="h-dvh flex flex-col bg-[#f3f3f3]">
      <Header><AuthButton /></Header>

      <main className="flex-1 min-h-0 flex flex-col items-center justify-center gap-5 px-6 py-4">

        {/* ── Title ── */}
        <div className="text-center space-y-1">
          {loading ? (
            <>
              <p className="text-sm text-gray-600 font-medium">world is loading</p>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-gray-900 tabular-nums">
                <NumberFlow value={fetchValue} format={{ maximumFractionDigits: 2 }} /><span className="ml-1">{fetchUnit}</span>
              </h1>
            </>
          ) : (
            <>
              <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-gray-900 tabular-nums">
                <NumberFlow value={animatedCount} /> countries ready
              </h1>
              <p className="text-sm text-gray-500">
                how many can you guess in 1 minute?
              </p>
            </>
          )}
        </div>

        {/* ── Presence Globe ── */}
        <div
          className="aspect-square"
          style={{
            width: 'min(65vw, 42dvh)',
            filter: 'drop-shadow(0 16px 40px rgba(66,124,223,0.18)) drop-shadow(0 4px 12px rgba(0,0,0,0.08))',
          }}
        >
          <PresenceGlobe cursors={cursors} currentStatus="home" initialPosition={initialPosition} onCursorMove={onCursorMove} onCameraChange={onCameraChange} />
        </div>

        {/* ── CTA ── */}
        <div className={`w-full max-w-xs transition-all duration-500 ${
          loaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}>
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={onStart} className="w-full">
              <span>play</span>
            </Button>
            {(onPractice || onExplore) && (
              <div className="flex gap-2">
                {onPractice && (
                  <Button size="lg" variant="secondary" onClick={onPractice} className="flex-1">
                    practice
                  </Button>
                )}
                {onExplore && (
                  <Button size="lg" variant="secondary" onClick={onExplore} className="flex-1">
                    explore
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

      </main>

      <Footer />
    </div>
  )
}
