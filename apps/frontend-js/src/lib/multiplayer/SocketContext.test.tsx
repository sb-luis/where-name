import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { SocketProvider, useSocket } from './SocketContext'
import type { Visitor } from './types'

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }))

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: useAuthMock,
}))

class FakeWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: FakeWebSocket[] = []

  readyState = FakeWebSocket.CONNECTING
  onopen: (() => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  onmessage: ((e: MessageEvent<string>) => void) | null = null
  sent: string[] = []

  constructor(public url: string) {
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  // -- test helpers, not part of the real WebSocket API --

  open() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  serverMessage(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent<string>)
  }

  serverClose() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  static latest(): FakeWebSocket {
    const ws = FakeWebSocket.instances.at(-1)
    if (!ws) throw new Error('no FakeWebSocket instance created yet')
    return ws
  }
}

function visitor(overrides: Partial<Visitor>): Visitor {
  return {
    id: 'v1',
    alias: null,
    color: '#fff',
    lat: null,
    lng: null,
    status: 'home',
    authenticated: false,
    ...overrides,
  }
}

function renderSocket() {
  return renderHook(() => useSocket(), { wrapper: SocketProvider })
}

beforeEach(() => {
  FakeWebSocket.instances = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  useAuthMock.mockReturnValue({ user: null, loading: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('SocketProvider connection lifecycle', () => {
  it('opens a connection on mount and reflects connected state', () => {
    const { result } = renderSocket()
    expect(result.current.connected).toBe(false)

    act(() => FakeWebSocket.latest().open())

    expect(result.current.connected).toBe(true)
  })

  it('does not connect while auth is still loading', () => {
    useAuthMock.mockReturnValue({ user: null, loading: true })
    renderSocket()
    expect(FakeWebSocket.instances).toHaveLength(0)
  })
})

describe('user identity transitions', () => {
  it('resets self, visitors, and sessionInactive when the authenticated user changes', () => {
    useAuthMock.mockReturnValue({ user: { id: 1 }, loading: false })
    const { result, rerender } = renderSocket()
    const firstWs = FakeWebSocket.latest()
    act(() => firstWs.open())
    act(() => firstWs.serverMessage({
      type: 'init',
      self: visitor({ id: 'me' }),
      visitors: [visitor({ id: 'me' }), visitor({ id: 'other' })],
    }))
    expect(result.current.self).not.toBeNull()
    expect(result.current.visitors).toHaveLength(2)

    // user logs out: a different identity (id undefined) means the effect
    // must treat this as a user change and clear the previous session's state.
    useAuthMock.mockReturnValue({ user: null, loading: false })
    act(() => rerender())

    expect(result.current.self).toBeNull()
    expect(result.current.visitors).toEqual([])
    expect(result.current.sessionInactive).toBe(false)
    // the old connection is torn down and a fresh one opened for the new identity
    expect(FakeWebSocket.instances.length).toBeGreaterThan(1)
    expect(FakeWebSocket.latest()).not.toBe(firstWs)
  })

  it('does not reset visitor state on a same-user reconnect (continueHere)', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())
    act(() => ws.serverMessage({
      type: 'init',
      self: visitor({ id: 'me' }),
      visitors: [visitor({ id: 'me' }), visitor({ id: 'other' })],
    }))

    act(() => result.current.continueHere())

    // reconnectKey changed but the user identity didn't, so prior state survives
    // until the new connection's own 'init' message arrives.
    expect(result.current.visitors).toHaveLength(2)
    expect(result.current.self).not.toBeNull()
  })
})

describe('reconnect backoff', () => {
  beforeEach(() => vi.useFakeTimers())

  it('reconnects after an unexpected close and doubles the delay each time, capped at 30s', () => {
    renderSocket()
    act(() => FakeWebSocket.latest().open())

    const expectedDelays = [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000]

    for (const delay of expectedDelays) {
      const countBefore = FakeWebSocket.instances.length
      act(() => FakeWebSocket.latest().serverClose())

      act(() => vi.advanceTimersByTime(delay - 1))
      expect(FakeWebSocket.instances.length).toBe(countBefore) // not yet

      act(() => vi.advanceTimersByTime(1))
      expect(FakeWebSocket.instances.length).toBe(countBefore + 1) // reconnected
    }
  })

  it('resets the backoff delay to 500ms after a successful reconnect', () => {
    renderSocket()
    act(() => FakeWebSocket.latest().open())

    act(() => FakeWebSocket.latest().serverClose())
    act(() => vi.advanceTimersByTime(500))
    act(() => FakeWebSocket.latest().open())

    act(() => FakeWebSocket.latest().serverClose())
    const countBefore = FakeWebSocket.instances.length
    act(() => vi.advanceTimersByTime(499))
    expect(FakeWebSocket.instances.length).toBe(countBefore)
    act(() => vi.advanceTimersByTime(1))
    expect(FakeWebSocket.instances.length).toBe(countBefore + 1)
  })

  it('does not reconnect after unmount', () => {
    const { unmount } = renderSocket()
    act(() => FakeWebSocket.latest().open())
    const countBefore = FakeWebSocket.instances.length

    unmount()
    act(() => vi.advanceTimersByTime(60_000))

    expect(FakeWebSocket.instances.length).toBe(countBefore)
  })
})

describe('duplicate session handling', () => {
  it('auto-declines by default: closes the socket and flags sessionInactive', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())

    act(() => ws.serverMessage({ type: 'duplicate_session' }))

    expect(result.current.sessionInactive).toBe(true)
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED)
    expect(ws.sent).toEqual([])
  })

  it('does not reconnect after auto-declining a duplicate session', () => {
    vi.useFakeTimers()
    renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())
    const countBefore = FakeWebSocket.instances.length

    act(() => ws.serverMessage({ type: 'duplicate_session' }))
    act(() => vi.advanceTimersByTime(60_000))

    expect(FakeWebSocket.instances.length).toBe(countBefore)
  })

  it('continueHere claims the session: sends takeover on the next duplicate_session', () => {
    const { result } = renderSocket()
    act(() => FakeWebSocket.latest().open())

    act(() => result.current.continueHere())
    const newWs = FakeWebSocket.latest()
    act(() => newWs.open())
    act(() => newWs.serverMessage({ type: 'duplicate_session' }))

    expect(newWs.sent).toEqual([JSON.stringify({ type: 'takeover' })])
    expect(result.current.sessionInactive).toBe(false)
  })

  it('kicked flags sessionInactive and does not reconnect', () => {
    vi.useFakeTimers()
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())
    const countBefore = FakeWebSocket.instances.length

    act(() => ws.serverMessage({ type: 'kicked' }))
    act(() => vi.advanceTimersByTime(60_000))

    expect(result.current.sessionInactive).toBe(true)
    expect(FakeWebSocket.instances.length).toBe(countBefore)
  })
})

describe('server message handling', () => {
  it('init sets self and the visitor list, clearing sessionInactive', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())

    const self = visitor({ id: 'me' })
    const other = visitor({ id: 'them' })
    act(() => ws.serverMessage({ type: 'init', self, visitors: [self, other] }))

    expect(result.current.self).toEqual(self)
    expect(result.current.visitors).toEqual([self, other])
    expect(result.current.sessionInactive).toBe(false)
  })

  it('visitor_joined appends, replacing any existing entry with the same id', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())
    act(() => ws.serverMessage({ type: 'init', self: visitor({ id: 'me' }), visitors: [visitor({ id: 'a' })] }))

    act(() => ws.serverMessage({ type: 'visitor_joined', visitor: visitor({ id: 'a', color: '#000' }) }))

    expect(result.current.visitors).toEqual([visitor({ id: 'a', color: '#000' })])
  })

  it('visitor_updated patches both self and the matching visitor entry', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())
    act(() => ws.serverMessage({
      type: 'init',
      self: visitor({ id: 'me', alias: 'old' }),
      visitors: [visitor({ id: 'me', alias: 'old' })],
    }))

    act(() => ws.serverMessage({ type: 'visitor_updated', id: 'me', alias: 'new' }))

    expect(result.current.self?.alias).toBe('new')
    expect(result.current.visitors[0].alias).toBe('new')
  })

  it('cursor_moved updates only the matching visitor\'s coordinates', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())
    act(() => ws.serverMessage({
      type: 'init',
      self: visitor({ id: 'me' }),
      visitors: [visitor({ id: 'a', lat: 1, lng: 1 }), visitor({ id: 'b', lat: 2, lng: 2 })],
    }))

    act(() => ws.serverMessage({ type: 'cursor_moved', id: 'a', lat: 9, lng: 9 }))

    expect(result.current.visitors.find(v => v.id === 'a')).toMatchObject({ lat: 9, lng: 9 })
    expect(result.current.visitors.find(v => v.id === 'b')).toMatchObject({ lat: 2, lng: 2 })
  })

  it('visitor_left removes the matching visitor', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())
    act(() => ws.serverMessage({
      type: 'init',
      self: visitor({ id: 'me' }),
      visitors: [visitor({ id: 'a' }), visitor({ id: 'b' })],
    }))

    act(() => ws.serverMessage({ type: 'visitor_left', id: 'a' }))

    expect(result.current.visitors.map(v => v.id)).toEqual(['b'])
  })

  it('ignores malformed (non-JSON) messages instead of throwing', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())

    expect(() => act(() => ws.onmessage?.({ data: 'not json' } as MessageEvent<string>))).not.toThrow()
    expect(result.current.visitors).toEqual([])
  })
})

describe('outbound actions', () => {
  it('setAlias and setColor send messages once connected', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())

    act(() => result.current.setAlias('Nomad'))
    act(() => result.current.setColor('#123456'))

    expect(ws.sent).toEqual([
      JSON.stringify({ type: 'set_alias', alias: 'Nomad' }),
      JSON.stringify({ type: 'set_color', color: '#123456' }),
    ])
  })

  it('does not send while disconnected', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    // never opened

    act(() => result.current.setAlias('Nomad'))

    expect(ws.sent).toEqual([])
  })

  it('emitCursorMove is a no-op when the visitor list is empty', () => {
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())
    act(() => ws.serverMessage({ type: 'init', self: visitor({ id: 'me' }), visitors: [] }))

    act(() => result.current.emitCursorMove(1, 2))

    expect(ws.sent).toEqual([])
  })

  it('emitCursorMove sends once the visitor list is non-empty, throttled to 100ms', () => {
    vi.useFakeTimers()
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())
    act(() => ws.serverMessage({
      type: 'init',
      self: visitor({ id: 'me' }),
      visitors: [visitor({ id: 'me' }), visitor({ id: 'other' })],
    }))

    act(() => result.current.emitCursorMove(1, 2))
    act(() => result.current.emitCursorMove(3, 4)) // within 100ms, dropped

    expect(ws.sent).toEqual([JSON.stringify({ type: 'cursor_move', lat: 1, lng: 2 })])

    act(() => vi.advanceTimersByTime(100))
    act(() => result.current.emitCursorMove(5, 6))

    expect(ws.sent).toEqual([
      JSON.stringify({ type: 'cursor_move', lat: 1, lng: 2 }),
      JSON.stringify({ type: 'cursor_move', lat: 5, lng: 6 }),
    ])
  })

  it('emitStatus sends set_status and replays it on the next reconnect', () => {
    vi.useFakeTimers()
    const { result } = renderSocket()
    const ws = FakeWebSocket.latest()
    act(() => ws.open())

    act(() => result.current.emitStatus('playing'))

    act(() => ws.serverClose())
    act(() => vi.advanceTimersByTime(500))
    const reconnected = FakeWebSocket.latest()
    act(() => reconnected.open())

    expect(reconnected.sent).toEqual([JSON.stringify({ type: 'set_status', status: 'playing' })])
  })
})
