'use client'

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'

export interface AuthUser {
  id: number
  username: string
  color: string
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
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
      .then(r => r.ok ? r.json() as Promise<AuthUser> : null)
      .then(data => setUser(data))
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
    setUser(data as unknown as AuthUser)
  }, [])

  const register = useCallback(async (username: string, password: string) => {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await parseJson(r)
    if (!r.ok) throw new Error(data?.error as string ?? 'Registration failed')
    setUser(data as unknown as AuthUser)
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
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
    setUser(data as unknown as AuthUser)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
