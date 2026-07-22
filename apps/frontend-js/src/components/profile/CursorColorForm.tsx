'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useAsyncAction } from '@/lib/useAsyncAction'

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b',
  '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b',
]

interface Props {
  initialColor: string
  onSubmit: (color: string) => Promise<void>
}

export function CursorColorForm({ initialColor, onSubmit }: Props) {
  const [pendingColor, setPendingColor] = useState<string | null>(null)
  const { busy, msg, setMsg, run } = useAsyncAction()

  const handleSubmit = () => {
    if (!pendingColor || pendingColor === initialColor || busy) return
    run(async () => {
      await onSubmit(pendingColor)
      setPendingColor(null)
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-9 gap-2 p-3">
        {COLOR_PALETTE.map(color => {
          const selected = (pendingColor ?? initialColor) === color
          return (
            <button
              key={color}
              type="button"
              onClick={() => { setPendingColor(color); setMsg(null) }}
              disabled={busy}
              className={`w-7 h-7 rounded-full transition-all duration-150 cursor-pointer disabled:cursor-not-allowed
                ${selected
                  ? 'ring-2 ring-offset-2 ring-gray-900 scale-110'
                  : 'hover:scale-110 active:scale-95'
                }`}
              style={{ backgroundColor: color }}
              aria-label={color}
              aria-pressed={selected}
            />
          )
        })}
      </div>
      {msg && (
        <p className={`text-[12px] font-medium ${msg.ok ? 'text-emerald-500' : 'text-red-400'}`}>
          {msg.text}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        onClick={handleSubmit}
        disabled={busy || !pendingColor || pendingColor === initialColor}
      >
        update cursor
      </Button>
    </div>
  )
}
