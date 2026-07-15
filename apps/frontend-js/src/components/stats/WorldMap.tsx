'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import type { GeoCollection } from '@/lib/geo/types'

const C_UNPLAYED = '#ebebeb'  // slate-300 — clearly distinct from the pale green end
const C_BG       = '#f5f4f4'

// Sequential YlGn scale — all steps clearly visible against the light background
const STEPS: [number, string][] = [
  [0.00, '#e46f6b'],  // red 
  [0.54, '#dfcb79'],  // red - yellow 
  [0.67, '#c3e27a'],  // green
]

function stepColor(winRate: number): string {
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (winRate >= STEPS[i][0]) return STEPS[i][1]
  }
  return STEPS[0][1]
}

export interface CountryStat {
  feature:        string
  correct:        number
  wrong:          number
  skipped:        number
  avg_correct_ms: number | null
}

interface TooltipState {
  x:    number
  y:    number
  name: string
  stat: CountryStat | null
}

interface Props {
  geo:   GeoCollection
  stats: CountryStat[]
}

function countryColor(stat: CountryStat | undefined): string {
  if (!stat) return C_UNPLAYED
  const total = stat.correct + stat.wrong + stat.skipped
  if (total === 0) return C_UNPLAYED
  return stepColor(stat.correct / total)
}

function formatMs(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`
}

export function WorldMap({ geo, stats }: Props) {
  const svgRef    = useRef<SVGSVGElement>(null)
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [dims, setDims]       = useState({ w: 800, h: 420 })

  useEffect(() => {
    const el = svgRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect
      setDims({ w: width, h: Math.round(width * 0.525) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const { w, h } = dims
    const projection = d3.geoNaturalEarth1().fitSize([w, h], geo)
    const path       = d3.geoPath(projection)
    const statMap    = new Map(stats.map(s => [s.feature, s]))

    // Background
    svg.append('rect').attr('width', w).attr('height', h).attr('fill', C_BG)

    // Countries — no stroke
    svg.append('g')
      .selectAll('path')
      .data(geo.features)
      .join('path')
        .attr('d', f => path(f) ?? '')
        .attr('fill', f => {
          const name = f.properties?.NAME ?? f.properties?.ADMIN ?? ''
          return countryColor(statMap.get(String(name)))
        })
        .attr('stroke', 'none')
        .style('cursor', 'pointer')
        .on('mousemove', (event: MouseEvent, f) => {
          const name = String(f.properties?.NAME ?? f.properties?.ADMIN ?? '')
          if (!svgRef.current) return
          const rect = svgRef.current.getBoundingClientRect()
          setTooltip({
            x:    event.clientX - rect.left,
            y:    event.clientY - rect.top,
            name,
            stat: statMap.get(name) ?? null,
          })
        })
        .on('mouseleave', () => setTooltip(null))
  }, [geo, stats, dims])

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        className="w-full rounded-xl"
        style={{ display: 'block' }}
      />

      {tooltip && (
        <div
          className="pointer-events-none absolute z-10 bg-white rounded-xl shadow-md border border-gray-100 px-3 py-2 text-sm"
          style={{ left: tooltip.x + 12, top: tooltip.y - 8 }}
        >
          <p className="font-semibold text-gray-800 mb-1">{tooltip.name}</p>
          {tooltip.stat ? (
            <div className="space-y-0.5 text-xs text-gray-500">
              <p>
                <span className="text-emerald-500 font-medium">{tooltip.stat.correct}</span> correct
                {tooltip.stat.avg_correct_ms != null && (
                  <span className="text-gray-400"> · avg {formatMs(tooltip.stat.avg_correct_ms)}</span>
                )}
              </p>
              {tooltip.stat.wrong   > 0 && <p><span className="text-rose-400 font-medium">{tooltip.stat.wrong}</span> wrong</p>}
              {tooltip.stat.skipped > 0 && <p><span className="text-gray-400 font-medium">{tooltip.stat.skipped}</span> skipped</p>}
            </div>
          ) : (
            <p className="text-xs text-gray-400">not played yet</p>
          )}
        </div>
      )}

      {/* Discrete step legend */}
      <div className="flex items-center gap-2 mt-3 px-1 flex-wrap">
        {STEPS.map(([threshold, color], i) => {
          const next = STEPS[i + 1]
          const label = next ? `${threshold * 100}–${next[0] * 100}%` : `${threshold * 100}–100%`
          return (
            <span key={threshold} className="flex items-center gap-1 text-[11px] text-gray-400">
              <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: color }} />
              {label}
            </span>
          )
        })}
        <span className="flex items-center gap-1 text-[11px] text-gray-400 ml-1">
          <span className="w-3 h-3 rounded-sm inline-block shrink-0" style={{ background: C_UNPLAYED }} />
          not played
        </span>
      </div>
    </div>
  )
}
