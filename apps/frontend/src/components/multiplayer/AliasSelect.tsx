'use client'

import { useState } from 'react'

interface Props {
  onSubmit: (alias: string) => void
}

export function AliasSelect({ onSubmit }: Props) {
  const [value, setValue] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim()
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 w-full">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        maxLength={20}
        placeholder="Pick a name…"
        autoFocus
        className="flex-1 min-w-0 px-5 py-3 rounded-full bg-black/[0.06] text-gray-900 font-semibold text-base focus:outline-none placeholder:text-gray-400 placeholder:font-normal"
      />
      <button
        type="submit"
        disabled={!value.trim()}
        className="w-12 h-12 shrink-0 rounded-full bg-gray-900 text-white font-semibold text-lg disabled:opacity-20 hover:bg-gray-700 active:scale-95 transition-all duration-150 flex items-center justify-center"
      >
        →
      </button>
    </form>
  )
}
