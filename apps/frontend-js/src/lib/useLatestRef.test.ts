import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useLatestRef } from './useLatestRef'

describe('useLatestRef', () => {
  it('returns a ref holding the initial value', () => {
    const { result } = renderHook(() => useLatestRef('a'))
    expect(result.current.current).toBe('a')
  })

  it('updates the ref to the latest value after a rerender', () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'b' })

    expect(result.current.current).toBe('b')
  })

  it('returns the same ref object across rerenders', () => {
    const { result, rerender } = renderHook(({ value }) => useLatestRef(value), {
      initialProps: { value: 'a' },
    })
    const first = result.current

    rerender({ value: 'b' })

    expect(result.current).toBe(first)
  })
})
