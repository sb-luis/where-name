'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAsyncAction } from '@/lib/useAsyncAction'

interface Props {
  initialUsername: string
  onSubmit: (username: string) => Promise<void>
}

export function AliasForm({ initialUsername, onSubmit }: Props) {
  const [pendingUsername, setPendingUsername] = useState<string | null>(null)
  const username = pendingUsername ?? initialUsername
  const { busy, msg, setMsg, run } = useAsyncAction()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = username.trim()
    if (trimmed === initialUsername) return
    run(() => onSubmit(trimmed))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 max-w-xs">
      <Input
        value={username}
        onChange={e => { setPendingUsername(e.target.value); setMsg(null) }}
        maxLength={20}
      />
      {msg && (
        <p className={`text-[12px] font-medium ${msg.ok ? 'text-emerald-500' : 'text-red-400'}`}>
          {msg.text}
        </p>
      )}
      <Button
        type="submit"
        size="sm"
        disabled={busy || !username.trim() || username.trim() === initialUsername}
      >
        update alias
      </Button>
    </form>
  )
}
