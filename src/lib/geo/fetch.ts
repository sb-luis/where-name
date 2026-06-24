import type { GeoCollection } from './types';

// Cache the Promise, not the resolved value — callers that arrive while a fetch
// is in-flight share the same Promise instead of each making their own request.
const cache = new Map<string, Promise<GeoCollection>>();

async function load(url: string): Promise<GeoCollection> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch geo data: ${r.status} ${r.statusText}`);
  return r.json();
}

export function fetchGeo(url: string): Promise<GeoCollection> {
  if (!cache.has(url)) {
    const p = load(url);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return cache.get(url)!;
}
