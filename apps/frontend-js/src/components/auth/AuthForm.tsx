'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export type AuthTab = 'login' | 'register'

interface Props {
  defaultTab?: AuthTab
  onSuccess?:  (tab: AuthTab) => void
  /** Spacing for the root wrapper — fully replaces the default, not merged. */
  className?: string
  /** Which gate/context this form was opened from */
  analyticsContext?: string
}

const DEFAULT_WRAPPER_CLASS = 'space-y-5'

export function AuthForm({ defaultTab = 'login', onSuccess, className = DEFAULT_WRAPPER_CLASS, analyticsContext }: Props) {
  const { login, register }     = useAuth()
  const [tab, setTab]           = useState<AuthTab>(defaultTab)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [busy, setBusy]         = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password) {
      setError('Enter a username and password')
      return
    }
    setBusy(true)
    try {
      if (tab === 'login') {
        await login(username, password)
      } else {
        await register(username, password, analyticsContext)
      }
      onSuccess?.(tab)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const switchTab = (t: AuthTab) => { setTab(t); setError(null) }

  return (
    <div className={className}>
      {/* Tab switcher */}
      <div className="flex gap-5 justify-center">
        {(['login', 'register'] as AuthTab[]).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className={`text-sm font-semibold pb-0.5 border-b-2 transition-colors cursor-pointer ${
              tab === t
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-300 hover:text-gray-500'
            }`}
          >
            {t === 'login' ? 'Log in' : 'Register'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder="Username"
          autoFocus
          autoComplete="username"
          maxLength={20}
          className="text-center"
        />
        <Input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          className="text-center"
        />

        {error && (
          <p className="text-xs text-red-400 text-center">{error}</p>
        )}

        <Button
          type="submit"
          disabled={busy}
          className="w-full mt-5"
        >
          {busy ? '…' : tab === 'login' ? 'Log in' : 'Create account'}
        </Button>
      </form>
    </div>
  )
}
