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
import { useAuth } from '@/lib/auth/AuthContext'
import type { Visitor, UserStatus } from './types'

// derive the WS URL from window.location 
// works in every environment 
function getWsUrl() {
  if (typeof window === 'undefined') return 'ws://localhost:4000/ws'
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${window.location.host}/ws`
}

type ServerMessage =
  | { type: 'init'; self: Visitor; visitors: Visitor[] }
  | { type: 'visitor_joined'; visitor: Visitor }
  | { type: 'visitor_updated'; id: string; alias?: string | null; status?: UserStatus }
  | { type: 'cursor_moved'; id: string; lat: number; lng: number }
  | { type: 'visitor_left'; id: string }
  | { type: 'duplicate_session' }
  | { type: 'kicked' }

type ClientMessage =
  | { type: 'set_alias'; alias: string }
  | { type: 'set_status'; status: UserStatus }
  | { type: 'cursor_move'; lat: number; lng: number }
  | { type: 'takeover' }

interface SocketContextValue {
  self: Visitor | null
  visitors: Visitor[]
  connected: boolean
  sessionInactive: boolean  // true = another tab is active; show the inactive banner
  continueHere: () => void  // claim this tab as the active session
  setAlias: (alias: string) => void
  emitCursorMove: (lat: number, lng: number) => void
  emitStatus: (status: UserStatus) => void
}

const SocketContext = createContext<SocketContextValue>({
  self: null,
  visitors: [],
  connected: false,
  sessionInactive: false,
  continueHere: () => {},
  setAlias: () => {},
  emitCursorMove: () => {},
  emitStatus: () => {},
})

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()

  const wsRef             = useRef<WebSocket | null>(null)
  const lastEmitRef       = useRef(0)
  const visitorCountRef   = useRef(0)
  const reconnectDelay    = useRef(500)
  const reconnectTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmounted         = useRef(false)
  const suppressReconnect = useRef(false)
  const lastStatus        = useRef<UserStatus | null>(null)
  const autoTakeover      = useRef(false)
  // Tracks the user ID from the previous effect run so we can distinguish
  // a user-change (login/logout) from a reconnectKey bump (continueHere).
  const prevUserId        = useRef<number | undefined>(undefined)

  const [self, setSelf]                       = useState<Visitor | null>(null)
  const [visitors, setVisitors]               = useState<Visitor[]>([])
  const [connected, setConnected]             = useState(false)
  const [sessionInactive, setSessionInactive] = useState(false)
  const [reconnectKey, setReconnectKey]       = useState(0)

  useEffect(() => {
    if (authLoading) return

    const userChanged = user?.id !== prevUserId.current
    prevUserId.current = user?.id

    unmounted.current         = false
    suppressReconnect.current = false
    reconnectDelay.current    = 500
    if (userChanged) {
      autoTakeover.current = false
      lastStatus.current   = null
      setSessionInactive(false)
      setSelf(null)
      setVisitors([])
    }

    function connect() {
      const ws = new WebSocket(getWsUrl())
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        reconnectDelay.current = 500
        if (lastStatus.current) {
          ws.send(JSON.stringify({ type: 'set_status', status: lastStatus.current } satisfies ClientMessage))
        }
      }

      ws.onclose = () => {
        setConnected(false)
        if (wsRef.current !== ws) return
        wsRef.current = null

        if (suppressReconnect.current) {
          suppressReconnect.current = false
          return
        }

        if (!unmounted.current) {
          reconnectTimer.current = setTimeout(connect, reconnectDelay.current)
          reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30_000)
        }
      }

      ws.onerror = () => {}

      ws.onmessage = (e: MessageEvent<string>) => {
        let msg: ServerMessage
        try {
          msg = JSON.parse(e.data) as ServerMessage
        } catch {
          return
        }

        switch (msg.type) {
          case 'init':
            autoTakeover.current = false
            setSessionInactive(false)
            setSelf(msg.self)
            setVisitors(msg.visitors ?? [])
            break

          case 'duplicate_session':
            if (autoTakeover.current) {
              // User clicked "Continue here instead" — take over silently.
              ws.send(JSON.stringify({ type: 'takeover' } satisfies ClientMessage))
            } else {
              // Another tab is already active. Auto-decline: close this
              // connection and show the inactive banner.
              suppressReconnect.current = true
              setSessionInactive(true)
              const w = wsRef.current
              wsRef.current = null
              w?.close()
            }
            break

          case 'kicked':
            // Another tab took over. Don't reconnect — show the inactive banner.
            suppressReconnect.current = true
            setSessionInactive(true)
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
      const ws = wsRef.current
      wsRef.current = null
      ws?.close()
    }
  }, [user?.id, authLoading, reconnectKey])

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  // Claim this tab as the active session. Opens a fresh WS connection that
  // will automatically send `takeover` when the server detects the duplicate.
  const continueHere = useCallback(() => {
    autoTakeover.current = true
    setReconnectKey(k => k + 1)
  }, [])

  const setAlias = useCallback((alias: string) => {
    send({ type: 'set_alias', alias })
  }, [send])

  useEffect(() => { visitorCountRef.current = visitors.length }, [visitors])

  const emitCursorMove = useCallback((lat: number, lng: number) => {
    // no need to stream cursor if no one is watching
    if (visitorCountRef.current === 0) return
    const now = Date.now()
    if (now - lastEmitRef.current < 100) return
    lastEmitRef.current = now
    send({ type: 'cursor_move', lat, lng })
    setSelf(prev => prev ? { ...prev, lat, lng } : prev)
  }, [send])

  const emitStatus = useCallback((status: UserStatus) => {
    lastStatus.current = status
    send({ type: 'set_status', status })
  }, [send])

  return (
    <SocketContext.Provider value={{
      self, visitors, connected,
      sessionInactive, continueHere,
      setAlias, emitCursorMove, emitStatus,
    }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = () => useContext(SocketContext)
