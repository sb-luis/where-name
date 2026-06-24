'use client'

import { useEffect, useRef, useState } from 'react'
import NumberFlow from '@number-flow/react'

interface Props {
  onStart: () => void
  loading?: boolean
  countryCount?: number
}

function formatMs(ms: number): { value: number; unit: string } {
  if (ms >= 1000) return { value: parseFloat((ms / 1000).toFixed(2)), unit: 's' }
  return { value: ms, unit: 'ms' }
}

export function WelcomeScreen({ onStart, loading = false, countryCount = 0 }: Props) {
  const startRef      = useRef(0)
  const alreadyLoaded = useRef(!loading)

  useEffect(() => {
    startRef.current = performance.now()
  }, [])
  const [liveMs, setLiveMs]           = useState(0)
  const [fetchMs, setFetchMs]         = useState<number | null>(null)
  const [animatedCount, setAnimatedCount] = useState(0)

  // Live counter while fetching
  useEffect(() => {
    if (alreadyLoaded.current || !loading) return
    const id = setInterval(
      () => setLiveMs(Math.round(performance.now() - startRef.current)),
      80,
    )
    return () => clearInterval(id)
  }, [loading])

  // Snap to final fetch time when done
  useEffect(() => {
    if (alreadyLoaded.current) return
    if (!loading && countryCount > 0 && fetchMs === null)
      setFetchMs(Math.round(performance.now() - startRef.current))
  }, [loading, countryCount, fetchMs])

  // Animate country count in
  useEffect(() => {
    if (countryCount > 0) setAnimatedCount(countryCount)
  }, [countryCount])

  const displayMs = fetchMs ?? liveMs
  const { value: fetchValue, unit: fetchUnit } = formatMs(displayMs)
  const loaded = !loading && countryCount > 0

  return (
    <main className="w-screen h-dvh bg-[#f3f3f3] flex flex-col items-center justify-center gap-10">

      <div className="text-center space-y-3">
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

      <button
        onClick={onStart}
        disabled={loading}
        className={`px-10 py-3.5 rounded-full font-semibold text-base transition-all duration-500 ${
          loaded
            ? 'bg-gray-900 text-white hover:bg-gray-700 active:scale-95 opacity-100 translate-y-0'
            : 'opacity-0 translate-y-8 pointer-events-none'
        }`}
      >
        Start Game
      </button>

    </main>
  )
}
