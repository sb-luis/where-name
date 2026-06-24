'use client'

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { io, type Socket } from 'socket.io-client'
import type { Visitor } from './types'

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3002'

interface SocketContextValue {
  self: Visitor | null
  visitors: Visitor[]
  connected: boolean
  setAlias: (alias: string) => void
  emitCursorMove: (lat: number, lng: number) => void
}

const SocketContext = createContext<SocketContextValue>({
  self: null,
  visitors: [],
  connected: false,
  setAlias: () => {},
  emitCursorMove: () => {},
})

export function SocketProvider({ children }: { children: ReactNode }) {
  const socketRef      = useRef<Socket | null>(null)
  const lastEmitRef    = useRef(0)
  const [self, setSelf]         = useState<Visitor | null>(null)
  const [visitors, setVisitors] = useState<Visitor[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket'] })
    socketRef.current = socket

    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))

    socket.on('init', ({ self: s, visitors: vs }: { self: Visitor; visitors: Visitor[] }) => {
      setSelf(s)
      setVisitors(vs)
    })

    socket.on('visitor_joined', (v: Visitor) => {
      setVisitors(prev => [...prev.filter(x => x.id !== v.id), v])
    })

    socket.on('visitor_updated', ({ id, alias }: { id: string; alias: string }) => {
      setSelf(prev => prev?.id === id ? { ...prev, alias } : prev)
      setVisitors(prev => prev.map(v => v.id === id ? { ...v, alias } : v))
    })

    socket.on('cursor_moved', ({ id, lat, lng }: { id: string; lat: number; lng: number }) => {
      setVisitors(prev => prev.map(v => v.id === id ? { ...v, lat, lng } : v))
    })

    socket.on('visitor_left', (id: string) => {
      setVisitors(prev => prev.filter(v => v.id !== id))
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  const setAlias = useCallback((alias: string) => {
    socketRef.current?.emit('set_alias', alias)
  }, [])

  const emitCursorMove = useCallback((lat: number, lng: number) => {
    const now = Date.now()
    if (now - lastEmitRef.current < 50) return
    lastEmitRef.current = now
    socketRef.current?.emit('cursor_move', { lat, lng })
  }, [])

  return (
    <SocketContext.Provider value={{ self, visitors, connected, setAlias, emitCursorMove }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
