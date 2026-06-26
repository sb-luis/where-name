'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExploreGlobe, type ExploreGlobeHandle } from '@/components/multiplayer/ExploreGlobe'
import { useSocket } from '@/lib/multiplayer/SocketContext'
import { usePresence } from '@/lib/multiplayer/usePresence'
import { useGame } from '@/lib/game/GameContext'

export default function ExplorePage() {
  const router                                  = useRouter()
  const { emitCursorMove, emitStatus }          = useSocket()
  const { cursors }                             = usePresence()
  const { cameraOrientationRef }                = useGame()
  const [hoveredCountry, setHoveredCountry]     = useState<string | null>(null)
  const globeRef                                = useRef<ExploreGlobeHandle>(null)

  useEffect(() => { emitStatus('explore') }, [emitStatus])

  const initialPosition = useMemo(() => {
    return cameraOrientationRef.current ?? undefined
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCameraChange = (lat: number, lng: number) => {
    cameraOrientationRef.current = { lat, lng }
  }

  return (
    <div className="relative w-screen h-dvh">
      <ExploreGlobe
        ref={globeRef}
        cursors={cursors}
        currentStatus="explore"
        onCursorMove={emitCursorMove}
        onCameraChange={handleCameraChange}
        onHover={setHoveredCountry}
      />

      {/* Top bar — mirrors the game HUD card */}
      <div className="pointer-events-none absolute top-5 inset-x-0 px-5">
        <div className="pointer-events-auto h-[72px] w-full rounded-2xl bg-white/90 backdrop-blur-sm shadow px-5 flex items-center gap-3">

          {/* Left: stacked label + country name */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 leading-none">
              Explore
            </p>
            <p className="text-xl font-bold truncate leading-tight text-gray-800">
              {hoveredCountry ?? <span className="text-gray-300">—</span>}
            </p>
          </div>

          {/* Right: back + reset */}
          <div className="flex-shrink-0 flex items-center gap-2.5">
            <button
              onClick={() => router.push('/')}
              className="rounded-full px-4 py-1.5 text-sm font-semibold text-gray-600
                bg-black/6 hover:bg-black/10 active:scale-95 transition-all duration-300 select-none"
            >
              ← Back
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 active:scale-95 transition-all duration-150 text-base"
              onClick={() => globeRef.current?.reset()}
              title="Reset view"
            >
              🌍
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
