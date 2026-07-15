import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePresence } from './usePresence'
import type { Visitor } from './types'

const { useSocketMock } = vi.hoisted(() => ({ useSocketMock: vi.fn() }))

vi.mock('./SocketContext', () => ({
  useSocket: useSocketMock,
}))

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

describe('usePresence', () => {
  it('passes visitors through unchanged', () => {
    const visitors = [visitor({ id: 'a' }), visitor({ id: 'b' })]
    useSocketMock.mockReturnValue({ visitors })

    const { result } = renderHook(() => usePresence())

    expect(result.current.visitors).toBe(visitors)
  })

  it('derives cursors only from visitors with both lat and lng set', () => {
    const withCursor = visitor({ id: 'a', lat: 10, lng: 20, alias: 'A', color: '#f00', status: 'playing' })
    const noLat = visitor({ id: 'b', lat: null, lng: 20 })
    const noLng = visitor({ id: 'c', lat: 10, lng: null })
    useSocketMock.mockReturnValue({ visitors: [withCursor, noLat, noLng] })

    const { result } = renderHook(() => usePresence())

    expect(result.current.cursors).toEqual([
      { id: 'a', alias: 'A', color: '#f00', lat: 10, lng: 20, status: 'playing' },
    ])
  })

  it('returns an empty cursors array when there are no visitors', () => {
    useSocketMock.mockReturnValue({ visitors: [] })

    const { result } = renderHook(() => usePresence())

    expect(result.current.cursors).toEqual([])
  })
})
