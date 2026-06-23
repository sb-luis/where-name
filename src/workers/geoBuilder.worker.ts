import { buildFillData, LINE_RADIUS } from '@/lib/geo/geometry';
import type { GeoCollection } from '@/lib/geo/types';

export interface FeatureData {
  name: string;
  fills: Array<{ positions: Float32Array; indices: Uint32Array }>;
  borders: Float32Array[];
}

export interface WorkerRequest {
  level: number;
  geojson: GeoCollection;
}

export interface WorkerResponse {
  level: number;
  features: FeatureData[];
}

// Inline sphere projection — keeps the worker free of THREE.Vector3 for border lines.
function project(lat: number, lon: number, r: number): [number, number, number] {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  ];
}

// TypeScript types `self` as Window under the dom lib; cast to any to satisfy the
// worker-specific onmessage/postMessage signatures at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const workerSelf = self as any;

workerSelf.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { level, geojson } = e.data;
  const features: FeatureData[] = [];
  const transfer: ArrayBuffer[] = [];

  for (const feature of geojson.features) {
    const name = String(feature.properties?.NAME ?? feature.properties?.ADMIN ?? 'Unknown');
    const { type, coordinates } = feature.geometry;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const polys = (type === 'Polygon' ? [coordinates] : coordinates) as any[][][];

    const fills: FeatureData['fills'] = [];
    const borders: Float32Array[] = [];

    for (const poly of polys) {
      try {
        // buildFillData uses THREE.Shape/ShapeGeometry for triangulation — Three.js
        // geometry classes are DOM-free and run safely inside Web Workers.
        const { positions, indices } = buildFillData(poly);
        fills.push({ positions, indices });
        transfer.push(positions.buffer as ArrayBuffer, indices.buffer as ArrayBuffer);
      } catch {
        // skip degenerate polygons
      }

      for (const ring of poly) {
        const arr = new Float32Array((ring as number[][]).length * 3);
        (ring as number[][]).forEach(([lon, lat], i) => {
          const [x, y, z] = project(lat, lon, LINE_RADIUS);
          arr[i * 3] = x; arr[i * 3 + 1] = y; arr[i * 3 + 2] = z;
        });
        borders.push(arr);
        transfer.push(arr.buffer as ArrayBuffer);
      }
    }

    features.push({ name, fills, borders });
  }

  const response: WorkerResponse = { level, features };
  workerSelf.postMessage(response, transfer);
};
