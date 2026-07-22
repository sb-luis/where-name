import { useEffect, useRef, type RefObject } from 'react'

// Keeps a ref pointed at the latest value, so a callback captured once
// (e.g. inside useFrame, which doesn't re-subscribe per render) can still
// read up-to-date props/state without itself becoming a dependency.
// Updates in an effect rather than the render body — assigning ref.current
// during render is a react-hooks/refs violation.
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value)
  useEffect(() => { ref.current = value })
  return ref
}
