'use client'

import { useState } from 'react'

interface Props {
  onSubmit: (alias: string) => void
}

export function AliasModal({ onSubmit }: Props) {
  const [value, setValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return
    onSubmit(trimmed)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-xs text-center space-y-4">
        <h2 className="text-xl font-bold text-gray-900">Pick a name</h2>
        <p className="text-sm text-gray-400">Everyone will see you as this</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={value}
            onChange={e => setValue(e.target.value)}
            maxLength={20}
            placeholder="Your alias…"
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-gray-900 text-center font-medium focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
          <button
            type="submit"
            disabled={!value.trim()}
            className="w-full py-2.5 rounded-full bg-gray-900 text-white font-semibold disabled:opacity-30 hover:bg-gray-700 active:scale-95 transition-all duration-150"
          >
            Join
          </button>
        </form>
      </div>
    </div>
  )
}
