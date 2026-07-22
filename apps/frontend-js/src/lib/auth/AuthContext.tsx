'use client'

import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react'
import { z } from 'zod'
import { identify, resetIdentity } from '@/lib/analytics/track'

const authUserSchema = z.object({
  id:         z.number(),
  username:   z.string(),
  color:      z.string(),
  created_at: z.string(),
})

export type AuthUser = z.infer<typeof authUserSchema>

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string, analyticsContext?: string) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (body: {
    username?: string
    current_password?: string
    new_password?: string
    cursor_color?: string
  }) => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  updateProfile: async () => {},
})

// Parse JSON safely — returns null if the body is empty or not valid JSON.
async function parseJson(r: Response): Promise<Record<string, unknown> | null> {
  const text = await r.text()
  if (!text) return null
  try { return JSON.parse(text) } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  // Rehydrate session on mount
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const user = data ? authUserSchema.parse(data) : null
        if (user) identify(user.id, { signed_up_at: user.created_at })
        setUser(user)
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await parseJson(r)
    if (!r.ok) throw new Error(data?.error as string ?? 'Login failed')
    const loggedInUser = authUserSchema.parse(data)
    identify(loggedInUser.id, { signed_up_at: loggedInUser.created_at })
    setUser(loggedInUser)
  }, [])

  const register = useCallback(async (username: string, password: string, analyticsContext?: string) => {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, context: analyticsContext }),
    })
    const data = await parseJson(r)
    if (!r.ok) throw new Error(data?.error as string ?? 'Registration failed')
    const registeredUser = authUserSchema.parse(data)
    identify(registeredUser.id, { signed_up_at: registeredUser.created_at })
    setUser(registeredUser)
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    resetIdentity()
    setUser(null)
  }, [])

  const updateProfile = useCallback(async (body: {
    username?: string
    current_password?: string
    new_password?: string
    cursor_color?: string
  }) => {
    const r = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await parseJson(r)
    if (!r.ok) throw new Error(data?.error as string ?? 'Update failed')
    setUser(authUserSchema.parse(data))
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, updateProfile }),
    [user, loading, login, register, logout, updateProfile],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
