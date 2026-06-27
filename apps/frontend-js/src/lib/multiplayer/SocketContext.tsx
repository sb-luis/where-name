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
import type { Visitor, UserStatus } from './types'

const WS_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'ws://localhost:4000/ws'

type ServerMessage =
  | { type: 'init'; self: Visitor; visitors: Visitor[] }
  | { type: 'visitor_joined'; visitor: Visitor }
  | { type: 'visitor_updated'; id: string; alias?: string | null; status?: UserStatus }
  | { type: 'cursor_moved'; id: string; lat: number; lng: number }
  | { type: 'visitor_left'; id: string }

type ClientMessage =
  | { type: 'set_alias'; alias: string }
  | { type: 'set_status'; status: UserStatus }
  | { type: 'cursor_move'; lat: number; lng: number }

interface SocketContextValue {
  self: Visitor | null
  visitors: Visitor[]
  connected: boolean
  setAlias: (alias: string) => void
  emitCursorMove: (lat: number, lng: number) => void
  emitStatus: (status: UserStatus) => void
}

const SocketContext = createContext<SocketContextValue>({
  self: null,
  visitors: [],
  connected: false,
  setAlias: () => {},
  emitCursorMove: () => {},
  emitStatus: () => {},
})

export function SocketProvider({ children }: { children: ReactNode }) {
  const wsRef             = useRef<WebSocket | null>(null)
  const lastEmitRef       = useRef(0)
  const pendingStatusRef  = useRef<UserStatus | null>(null)
  const reconnectDelay    = useRef(500)
  const reconnectTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted         = useRef(false)

  const [self, setSelf]           = useState<Visitor | null>(null)
  const [visitors, setVisitors]   = useState<Visitor[]>([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    unmounted.current = false

    function connect() {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectDelay.current = 500
        if (pendingStatusRef.current) {
          ws.send(JSON.stringify({ type: 'set_status', status: pendingStatusRef.current } satisfies ClientMessage))
        }
      }

      ws.onclose = () => {
        setConnected(false)
        // Guard against a stale onclose firing after a new connection has already
        // been established (e.g. React Strict Mode double-invoke).
        if (wsRef.current !== ws) return
        wsRef.current = null
        if (!unmounted.current) {
          reconnectTimer.current = setTimeout(connect, reconnectDelay.current)
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000)
        }
      }

      ws.onerror = () => {} // onclose always follows; reconnect logic lives there

      ws.onmessage = (e: MessageEvent<string>) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(e.data) as ServerMessage
        } catch {
          return
        }
        switch (msg.type) {
          case 'init':
            setSelf(msg.self)
            setVisitors(msg.visitors ?? [])
            break
          case 'visitor_joined':
            setVisitors(prev => [...prev.filter(x => x.id !== msg.visitor.id), msg.visitor])
            break
          case 'visitor_updated': {
            const { type: _, id, ...patch } = msg
            setSelf(prev => prev?.id === id ? { ...prev, ...patch } : prev)
            setVisitors(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v))
            break
          }
          case 'cursor_moved':
            setVisitors(prev => prev.map(v =>
              v.id === msg.id ? { ...v, lat: msg.lat, lng: msg.lng } : v
            ))
            break
          case 'visitor_left':
            setVisitors(prev => prev.filter(v => v.id !== msg.id))
            break
        }
      }
    }

    connect()

    return () => {
      unmounted.current = true
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [])

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const setAlias = useCallback((alias: string) => {
    send({ type: 'set_alias', alias })
  }, [send])

  const emitCursorMove = useCallback((lat: number, lng: number) => {
    const now = Date.now()
    if (now - lastEmitRef.current < 100) return
    lastEmitRef.current = now
    send({ type: 'cursor_move', lat, lng })
    setSelf(prev => prev ? { ...prev, lat, lng } : prev)
  }, [send])

  const emitStatus = useCallback((status: UserStatus) => {
    pendingStatusRef.current = status
    send({ type: 'set_status', status })
  }, [send])

  return (
    <SocketContext.Provider value={{ self, visitors, connected, setAlias, emitCursorMove, emitStatus }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
