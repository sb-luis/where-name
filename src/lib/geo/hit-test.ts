import type { GeoFeature } from './types';

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (((yi > lat) !== (yj > lat)) && (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function hitTestFeature(lon: number, lat: number, feature: GeoFeature): string | null {
  const { type, coordinates } = feature.geometry;
  const polys = type === 'Polygon'
    ? [coordinates as number[][][]]
    : coordinates as number[][][][];

  for (const poly of polys) {
    if (!pointInRing(lon, lat, poly[0])) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (pointInRing(lon, lat, poly[h])) { inHole = true; break; }
    }
    if (!inHole) {
      return String(feature.properties?.NAME ?? feature.properties?.ADMIN ?? 'Unknown');
    }
  }
  return null;
}

export function pickCountry(lon: number, lat: number, features: GeoFeature[]): string | null {
  for (const feature of features) {
    const name = hitTestFeature(lon, lat, feature);
    if (name !== null) return name;
  }
  return null;
}
