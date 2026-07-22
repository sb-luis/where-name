import { describe, it, expect } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useAsyncAction } from './useAsyncAction'

describe('useAsyncAction', () => {
  it('sets a success message on resolve', async () => {
    const { result } = renderHook(() => useAsyncAction('updated'))

    await act(async () => {
      await result.current.run(async () => {})
    })

    expect(result.current.busy).toBe(false)
    expect(result.current.msg).toEqual({ ok: true, text: 'updated' })
  })

  it('sets an error message from an Error rejection', async () => {
    const { result } = renderHook(() => useAsyncAction())

    await act(async () => {
      await result.current.run(async () => { throw new Error('nope') })
    })

    expect(result.current.msg).toEqual({ ok: false, text: 'nope' })
  })

  it('falls back to a generic message for a non-Error rejection', async () => {
    const { result } = renderHook(() => useAsyncAction())

    await act(async () => {
      await result.current.run(async () => { throw 'raw string' })
    })

    expect(result.current.msg).toEqual({ ok: false, text: 'something went wrong' })
  })

  it('is busy while the action is in flight', async () => {
    const { result } = renderHook(() => useAsyncAction())
    let resolve!: () => void
    const pending = new Promise<void>(res => { resolve = res })

    act(() => {
      void result.current.run(() => pending)
    })

    await waitFor(() => expect(result.current.busy).toBe(true))

    await act(async () => {
      resolve()
      await pending
    })

    expect(result.current.busy).toBe(false)
  })

  it('clears the previous message when a new run starts', async () => {
    const { result } = renderHook(() => useAsyncAction())

    await act(async () => {
      await result.current.run(async () => { throw new Error('first') })
    })
    expect(result.current.msg?.text).toBe('first')

    let resolve!: () => void
    const pending = new Promise<void>(res => { resolve = res })
    act(() => {
      void result.current.run(() => pending)
    })

    await waitFor(() => expect(result.current.msg).toBeNull())

    await act(async () => {
      resolve()
      await pending
    })
  })
})
