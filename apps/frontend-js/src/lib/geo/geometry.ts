import * as THREE from 'three';
import type { Polygon, Ring } from './types';

export const FILL_RADIUS = 1.0005;
export const LINE_RADIUS = 1.001;
const MAX_EDGE_DEG = 2;

export interface RingExtent {
  minLon: number; maxLon: number;
  minLat: number; maxLat: number;
  centerLat: number; centerLon: number;
}

// Bounding box + vertex-average center of a single ring.
export function ringExtent(ring: Ring): RingExtent {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  let sumLon = 0, sumLat = 0;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    sumLon += lon; sumLat += lat;
  }
  return {
    minLon, maxLon, minLat, maxLat,
    centerLat: sumLat / ring.length,
    centerLon: sumLon / ring.length,
  };
}

// Picks the largest ring (by vertex count) across a feature's polygons
// and returns its extent — same ring used for the centroid, so both agree.
export function largestRingExtent(polys: Polygon[]): RingExtent {
  let ring = polys[0][0];
  for (const poly of polys) { if (poly[0].length > ring.length) ring = poly[0]; }
  return ringExtent(ring);
}

// Angular size (degrees) of a ring's extent, for FOV framing. Longitude
// degrees narrow by cos(lat) away from the equator, and spans can wrap
// the antimeridian, so use the smaller of the raw/wrapped lon span.
export function angularExtentDeg(extent: RingExtent): number {
  const latSpan = extent.maxLat - extent.minLat;
  const rawLonSpan = extent.maxLon - extent.minLon;
  const lonSpan = Math.min(rawLonSpan, 360 - rawLonSpan);
  const meanLatRad = extent.centerLat * (Math.PI / 180);
  const scaledLonSpan = lonSpan * Math.cos(meanLatRad);
  return Math.max(latSpan, scaledLonSpan);
}

// FOV (degrees) needed to frame an angular extent (degrees of arc on the
// unit globe) at CAMERA_DIST, with padding so the country fills ~30% of
// the viewport height instead of edge-to-edge.
export function fitFovForExtent(extentDeg: number, cameraDist: number): number {
  const FILL_FRACTION = 0.05;
  const worldSpan = extentDeg * (Math.PI / 180); // arc length on unit sphere (R=1)
  const half = worldSpan / 2 / FILL_FRACTION;
  const dist = cameraDist - 1; // camera to near surface of globe
  return 2 * Math.atan(half / dist) * (180 / Math.PI);
}

export function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi   = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta),
  );
}

export function vec3ToLatLon(v: THREE.Vector3): { lat: number; lon: number } {
  const lat = Math.asin(v.y) * (180 / Math.PI);
  let theta = Math.atan2(v.z, -v.x);
  if (theta < 0) theta += 2 * Math.PI;
  const lon = theta * (180 / Math.PI) - 180;
  return { lat, lon };
}

// Camera position for orbiting at `dist` above (lat, lng).
// tuple since @react-three/fiber's `camera.position` prop takes [x, y, z].
export function latLngToCameraPos(lat: number, lng: number, dist: number): [number, number, number] {
  const v = latLonToVec3(lat, lng, dist);
  return [v.x, v.y, v.z];
}

// Returns raw typed arrays so callers can use them
// without wrapping in Three.js objects on the compute side.
export function buildFillData(poly: Polygon): { positions: Float32Array; indices: Uint32Array } {
  const stripClose = (ring: number[][]): THREE.Vector2[] => {
    const pts = ring.map(([lon, lat]) => new THREE.Vector2(lon, lat));
    const f = pts[0], l = pts[pts.length - 1];
    if (f.x === l.x && f.y === l.y) pts.pop();
    return pts;
  };

  // phase 1: 2D triangulation in lon/lat space
  const [outerRaw, ...holeRaws] = poly;
  const shape = new THREE.Shape(stripClose(outerRaw));
  shape.holes = holeRaws.map(h => new THREE.Path(stripClose(h)));

  const raw = new THREE.ShapeGeometry(shape);
  const rp  = raw.attributes.position as THREE.BufferAttribute;
  const ri  = raw.index!;

  const verts: [number, number][] = [];
  for (let i = 0; i < rp.count; i++) verts.push([rp.getX(i), rp.getY(i)]);

  let tris: [number, number, number][] = [];
  for (let i = 0; i < ri.count; i += 3)
    tris.push([ri.getX(i), ri.getX(i + 1), ri.getX(i + 2)]);
  raw.dispose();

  // phase 2: subdivide — split any edge longer than MAX_EDGE_DEG until all fit
  const midCache = new Map<string, number>();
  const getMid = (a: number, b: number): number => {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (midCache.has(key)) return midCache.get(key)!;
    const mi = verts.length;
    verts.push([(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2]);
    midCache.set(key, mi);
    return mi;
  };

  let changed = true;
  while (changed) {
    changed = false;
    const next: [number, number, number][] = [];
    for (const [a, b, c] of tris) {
      const [ax, ay] = verts[a], [bx, by] = verts[b], [cx, cy] = verts[c];
      const dab = Math.hypot(bx - ax, by - ay);
      const dbc = Math.hypot(cx - bx, cy - by);
      const dca = Math.hypot(ax - cx, ay - cy);
      const mx  = Math.max(dab, dbc, dca);
      if (mx <= MAX_EDGE_DEG) { next.push([a, b, c]); continue; }
      changed = true;
      if      (mx === dab) { const m = getMid(a, b); next.push([a, m, c], [m, b, c]); }
      else if (mx === dbc) { const m = getMid(b, c); next.push([a, b, m], [a, m, c]); }
      else                 { const m = getMid(c, a); next.push([a, b, m], [m, b, c]); }
    }
    tris = next;
  }

  // phase 3: project to sphere
  const positions = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    const v = latLonToVec3(verts[i][1], verts[i][0], FILL_RADIUS);
    positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z;
  }

  const indices = new Uint32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    indices[i * 3] = tris[i][0]; indices[i * 3 + 1] = tris[i][1]; indices[i * 3 + 2] = tris[i][2];
  }

  return { positions, indices };
}

export function buildFillGeo(poly: Polygon): THREE.BufferGeometry {
  const { positions, indices } = buildFillData(poly);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(indices, 1));
  return geo;
}
