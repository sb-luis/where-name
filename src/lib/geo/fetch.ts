import type { GeoCollection } from './types';

const cache = new Map<string, GeoCollection>();

export async function fetchGeo(url: string): Promise<GeoCollection> {
  if (cache.has(url)) return cache.get(url)!;
  const res  = await fetch(url);
  const data = (await res.json()) as GeoCollection;
  cache.set(url, data);
  return data;
}
