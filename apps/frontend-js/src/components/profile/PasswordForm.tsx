'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useAsyncAction } from '@/lib/useAsyncAction'

interface Props {
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>
}

export function PasswordForm({ onSubmit }: Props) {
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw]         = useState('')
  const { busy, msg, setMsg, run } = useAsyncAction()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      await onSubmit(currentPw, newPw)
      setCurrentPw('')
      setNewPw('')
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2.5 max-w-xs">
      <Input
        type="password"
        value={currentPw}
        onChange={e => { setCurrentPw(e.target.value); setMsg(null) }}
        placeholder="current"
        autoComplete="current-password"
      />
      <Input
        type="password"
        value={newPw}
        onChange={e => { setNewPw(e.target.value); setMsg(null) }}
        placeholder="new (8+ chars)"
        autoComplete="new-password"
      />
      {msg && (
        <p className={`text-[12px] font-medium ${msg.ok ? 'text-emerald-500' : 'text-red-400'}`}>
          {msg.text}
        </p>
      )}
      <Button
        type="submit"
        size="sm"
        disabled={busy || !currentPw || newPw.length < 8}
      >
        update password
      </Button>
    </form>
  )
}
