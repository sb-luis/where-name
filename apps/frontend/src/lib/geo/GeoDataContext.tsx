'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { fetchGeo } from './fetch'
import type { GeoCollection } from './types'

interface ContextValue {
  collections: ReadonlyMap<string, GeoCollection>
  loadCollection: (url: string) => Promise<GeoCollection>
}

const GeoDataContext = createContext<ContextValue | null>(null)

export function GeoDataProvider({ children }: { children: ReactNode }) {
  const [collections, setCollections] = useState<Map<string, GeoCollection>>(new Map)

  const loadCollection = useCallback(async (url: string): Promise<GeoCollection> => {
    const data = await fetchGeo(url)
    setCollections(prev => {
      if (prev.has(url)) return prev
      const next = new Map(prev)
      next.set(url, data)
      return next
    })
    return data
  }, [])

  return (
    <GeoDataContext.Provider value={{ collections, loadCollection }}>
      {children}
    </GeoDataContext.Provider>
  )
}

export function useGeoData(): ContextValue {
  const ctx = useContext(GeoDataContext)
  if (!ctx) throw new Error('useGeoData must be used inside GeoDataProvider')
  return ctx
}
