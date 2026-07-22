import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCursorTracker } from './useCursorTracker'
import { latLonToVec3 } from './geometry'
import type { CursorData } from '@/lib/multiplayer/types'

function cursor(overrides: Partial<CursorData> & Pick<CursorData, 'id'>): CursorData {
  return { alias: null, color: '#fff', lat: 0, lng: 0, status: 'explore', ...overrides }
}

function target(c: CursorData) {
  return latLonToVec3(c.lat, c.lng, 1).normalize()
}

describe('useCursorTracker', () => {
  it('adds a cursor with currentVec and targetVec both at its starting position', () => {
    const a = cursor({ id: 'a', lat: 10, lng: 20, status: 'playing' })
    const { result } = renderHook(({ cursors }) => useCursorTracker(cursors), {
      initialProps: { cursors: [a] },
    })

    const state = result.current.cursorDataRef.current.get('a')!
    expect(state).toBeDefined()
    expect(state.status).toBe('playing')
    expect(state.currentVec.equals(target(a))).toBe(true)
    expect(state.targetVec.equals(target(a))).toBe(true)
    // Distinct vector instances — the frame loop lerps currentVec toward
    // targetVec in place, so they must never alias the same object.
    expect(state.currentVec).not.toBe(state.targetVec)
  })

  it('derives cursorMeta from the cursors prop, defaulting a null alias to empty string', () => {
    const a = cursor({ id: 'a', color: '#f00', alias: 'Ada' })
    const b = cursor({ id: 'b', color: '#0f0', alias: null })
    const { result } = renderHook(({ cursors }) => useCursorTracker(cursors), {
      initialProps: { cursors: [a, b] },
    })

    expect(result.current.cursorMeta).toEqual([
      { id: 'a', color: '#f00', alias: 'Ada' },
      { id: 'b', color: '#0f0', alias: '' },
    ])
  })

  it('updates targetVec and status in place on re-render, without touching currentVec', () => {
    const a = cursor({ id: 'a', lat: 0, lng: 0, status: 'explore' })
    const { result, rerender } = renderHook(({ cursors }) => useCursorTracker(cursors), {
      initialProps: { cursors: [a] },
    })

    const stateBefore   = result.current.cursorDataRef.current.get('a')!
    const currentVecRef = stateBefore.currentVec
    // Simulate the frame loop having partially animated currentVec away
    // from the original target, so we can tell it's untouched by the sync.
    currentVecRef.set(0.5, 0.5, 0.5)

    const moved = cursor({ id: 'a', lat: 45, lng: 90, status: 'playing' })
    rerender({ cursors: [moved] })

    const stateAfter = result.current.cursorDataRef.current.get('a')!
    expect(stateAfter).toBe(stateBefore) // same object, mutated in place
    expect(stateAfter.status).toBe('playing')
    expect(stateAfter.targetVec.equals(target(moved))).toBe(true)
    expect(stateAfter.currentVec.equals(currentVecRef)).toBe(true)
  })

  it('drops cursors that disappear from the prop and keeps the ones that remain', () => {
    const a = cursor({ id: 'a' })
    const b = cursor({ id: 'b' })
    const { result, rerender } = renderHook(({ cursors }) => useCursorTracker(cursors), {
      initialProps: { cursors: [a, b] },
    })

    expect([...result.current.cursorDataRef.current.keys()].sort()).toEqual(['a', 'b'])

    rerender({ cursors: [b] })

    expect([...result.current.cursorDataRef.current.keys()]).toEqual(['b'])
  })

  it('adds newly-appearing cursors on a later render', () => {
    const a = cursor({ id: 'a' })
    const { result, rerender } = renderHook(({ cursors }) => useCursorTracker(cursors), {
      initialProps: { cursors: [a] },
    })

    const c = cursor({ id: 'c', lat: -30, lng: 60 })
    rerender({ cursors: [a, c] })

    expect([...result.current.cursorDataRef.current.keys()].sort()).toEqual(['a', 'c'])
    expect(result.current.cursorDataRef.current.get('c')!.targetVec.equals(target(c))).toBe(true)
  })

  it('keeps cursorRefsMap stable and empty — it is populated by DOM ref callbacks, not this hook', () => {
    const a = cursor({ id: 'a' })
    const { result, rerender } = renderHook(({ cursors }) => useCursorTracker(cursors), {
      initialProps: { cursors: [a] },
    })

    const refsMap = result.current.cursorRefsMap
    expect(refsMap.current.size).toBe(0)

    rerender({ cursors: [a, cursor({ id: 'b' })] })
    expect(result.current.cursorRefsMap).toBe(refsMap) // stable across renders
    expect(refsMap.current.size).toBe(0)
  })
})
