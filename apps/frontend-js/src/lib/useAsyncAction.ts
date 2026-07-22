import { useState, useCallback } from 'react'

export interface AsyncActionMessage {
  ok: boolean
  text: string
}

// Runs an async action while tracking busy/success/error state, so
// components don't each hand-roll the same busy → try → catch → finally shape.
export function useAsyncAction(successText = 'updated') {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg]   = useState<AsyncActionMessage | null>(null)

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      setMsg({ ok: true, text: successText })
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : 'something went wrong' })
    } finally {
      setBusy(false)
    }
  }, [successText])

  return { busy, msg, setMsg, run }
}
