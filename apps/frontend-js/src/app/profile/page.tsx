'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useSocket } from '@/lib/multiplayer/SocketContext'

export const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b',
  '#eab308', '#84cc16', '#22c55e',
  '#10b981', '#14b8a6', '#06b6d4',
  '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b',
]

type Msg = { ok: boolean; text: string }

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    >
      <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface SectionProps {
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}

function Section({ label, open, onToggle, children }: SectionProps) {
  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer group"
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-gray-400 group-hover:text-gray-500 transition-colors">
          {label}
        </span>
        <Chevron open={open} />
      </button>

      <div className={`grid transition-all duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden">
          <div className="px-5 pb-5">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const { user, loading, updateProfile, logout } = useAuth()
  const { setAlias: emitAlias, setColor: emitColor } = useSocket()

  useEffect(() => {
    if (!loading && !user) router.replace('/')
  }, [loading, user, router])

  const [openSection, setOpenSection] = useState<'alias' | 'password' | 'cursor' | null>(null)
  const toggle = (s: typeof openSection) => setOpenSection(prev => prev === s ? null : s)

  const [username, setUsername]         = useState('')
  const [usernameBusy, setUsernameBusy] = useState(false)
  const [usernameMsg, setUsernameMsg]   = useState<Msg | null>(null)

  const [currentPw, setCurrentPw]       = useState('')
  const [newPw, setNewPw]               = useState('')
  const [passwordBusy, setPasswordBusy] = useState(false)
  const [passwordMsg, setPasswordMsg]   = useState<Msg | null>(null)

  const [colorBusy, setColorBusy] = useState(false)
  const [pendingColor, setPendingColor] = useState<string | null>(null)
  const [colorMsg, setColorMsg] = useState<Msg | null>(null)

  useEffect(() => {
    if (user) setUsername(user.username)
  }, [user?.username])

  if (loading || !user) return null

  const handleUsernameSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = username.trim()
    if (trimmed === user.username) return
    setUsernameBusy(true)
    setUsernameMsg(null)
    try {
      await updateProfile({ username: trimmed })
      emitAlias(trimmed)
      setUsernameMsg({ ok: true, text: 'updated' })
    } catch (err) {
      setUsernameMsg({ ok: false, text: err instanceof Error ? err.message : 'something went wrong' })
    } finally {
      setUsernameBusy(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordBusy(true)
    setPasswordMsg(null)
    try {
      await updateProfile({ current_password: currentPw, new_password: newPw })
      setPasswordMsg({ ok: true, text: 'updated' })
      setCurrentPw('')
      setNewPw('')
    } catch (err) {
      setPasswordMsg({ ok: false, text: err instanceof Error ? err.message : 'something went wrong' })
    } finally {
      setPasswordBusy(false)
    }
  }

  const handleColorSubmit = async () => {
    if (!pendingColor || pendingColor === user.color || colorBusy) return
    setColorBusy(true)
    setColorMsg(null)
    try {
      await updateProfile({ cursor_color: pendingColor })
      emitColor(pendingColor)
      setColorMsg({ ok: true, text: 'updated' })
      setPendingColor(null)
    } catch (err) {
      setColorMsg({ ok: false, text: err instanceof Error ? err.message : 'something went wrong' })
    } finally {
      setColorBusy(false)
    }
  }

  return (
    <main className="h-dvh overflow-y-auto bg-[#f3f3f3] px-4 py-5 md:px-6">
      <div className="max-w-2xl mx-auto space-y-4 pb-10">

        {/* Top card */}
        <div className="rounded-2xl bg-white shadow-sm border border-gray-100 px-5 py-3 flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="rounded-full px-4 py-1.5 text-sm font-semibold text-gray-600 bg-black/6 hover:bg-black/10 active:scale-95 transition-all duration-300 select-none"
          >
            where.name
          </button>
          <p className="flex-1 text-center text-sm font-semibold text-gray-500 uppercase tracking-widest">Profile</p>
          <button
            onClick={logout}
            className="rounded-full px-4 py-1.5 text-sm font-semibold text-gray-600 bg-black/6 hover:bg-black/10 active:scale-95 transition-all duration-300 select-none"
          >
            log out
          </button>
        </div>

        <div className="space-y-3">

          {/* Alias */}
          <Section
            label="alias"
            open={openSection === 'alias'}
            onToggle={() => toggle('alias')}
          >
            <form onSubmit={handleUsernameSubmit} className="space-y-2.5 max-w-xs">
              <Input
                value={username}
                onChange={e => { setUsername(e.target.value); setUsernameMsg(null) }}
                maxLength={20}
              />
              {usernameMsg && (
                <p className={`text-[12px] font-medium ${usernameMsg.ok ? 'text-emerald-500' : 'text-red-400'}`}>
                  {usernameMsg.text}
                </p>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={usernameBusy || !username.trim() || username.trim() === user.username}
              >
                update alias
              </Button>
            </form>
          </Section>

          {/* Password */}
          <Section
            label="password"
            open={openSection === 'password'}
            onToggle={() => toggle('password')}
          >
            <form onSubmit={handlePasswordSubmit} className="space-y-2.5 max-w-xs">
              <Input
                type="password"
                value={currentPw}
                onChange={e => { setCurrentPw(e.target.value); setPasswordMsg(null) }}
                placeholder="current"
                autoComplete="current-password"
              />
              <Input
                type="password"
                value={newPw}
                onChange={e => { setNewPw(e.target.value); setPasswordMsg(null) }}
                placeholder="new (8+ chars)"
                autoComplete="new-password"
              />
              {passwordMsg && (
                <p className={`text-[12px] font-medium ${passwordMsg.ok ? 'text-emerald-500' : 'text-red-400'}`}>
                  {passwordMsg.text}
                </p>
              )}
              <Button
                type="submit"
                size="sm"
                disabled={passwordBusy || !currentPw || newPw.length < 8}
              >
                update password
              </Button>
            </form>
          </Section>

          {/* Cursor color */}
          <Section
            label="cursor"
            open={openSection === 'cursor'}
            onToggle={() => toggle('cursor')}
          >
            <div className="space-y-3">
              <div className="grid grid-cols-9 gap-2 p-3">
                {COLOR_PALETTE.map(color => {
                  const selected = (pendingColor ?? user.color) === color
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() => { setPendingColor(color); setColorMsg(null) }}
                      disabled={colorBusy}
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
              {colorMsg && (
                <p className={`text-[12px] font-medium ${colorMsg.ok ? 'text-emerald-500' : 'text-red-400'}`}>
                  {colorMsg.text}
                </p>
              )}
              <Button
                type="button"
                size="sm"
                onClick={handleColorSubmit}
                disabled={colorBusy || !pendingColor || pendingColor === user.color}
              >
                update cursor
              </Button>
            </div>
          </Section>

        </div>

      </div>
    </main>
  )
}
