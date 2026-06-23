import * as THREE from 'three';
import type { Polygon } from './types';

export const FILL_RADIUS = 1.0005;
export const LINE_RADIUS = 1.001;
const MAX_EDGE_DEG = 2;

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

export function buildFillGeo(poly: Polygon): THREE.BufferGeometry {
  const stripClose = (ring: number[][]): THREE.Vector2[] => {
    const pts = ring.map(([lon, lat]) => new THREE.Vector2(lon, lat));
    const f = pts[0], l = pts[pts.length - 1];
    if (f.x === l.x && f.y === l.y) pts.pop();
    return pts;
  };

  // phase 1: 2D triangulation in lon/lat space
  // can't triangulate on the sphere surface 
  const [outerRaw, ...holeRaws] = poly;
  const shape = new THREE.Shape(stripClose(outerRaw));
  shape.holes = holeRaws.map(h => new THREE.Path(stripClose(h)));

  const raw = new THREE.ShapeGeometry(shape); // ear-clipping
  const rp  = raw.attributes.position as THREE.BufferAttribute;
  const ri  = raw.index!;

  const verts: [number, number][] = [];
  for (let i = 0; i < rp.count; i++) verts.push([rp.getX(i), rp.getY(i)]);

  let tris: [number, number, number][] = [];
  for (let i = 0; i < ri.count; i += 3)
    tris.push([ri.getX(i), ri.getX(i + 1), ri.getX(i + 2)]);
  raw.dispose();

  // phase 2: subdivission
  // split any triangle whose longest edge exceeds MAX_EDGE_DEG = 2° 
  // until all edges are short enough to wrap around the sphere without overlaps
  // (no edge is longer than ~220 km)

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

  // phase 3: project polygon to sphere

  const positions = new Float32Array(verts.length * 3);
  for (let i = 0; i < verts.length; i++) {
    const v = latLonToVec3(verts[i][1], verts[i][0], FILL_RADIUS);
    positions[i * 3] = v.x; positions[i * 3 + 1] = v.y; positions[i * 3 + 2] = v.z;
  }

  const idxArr = new Uint32Array(tris.length * 3);
  for (let i = 0; i < tris.length; i++) {
    idxArr[i * 3] = tris[i][0]; idxArr[i * 3 + 1] = tris[i][1]; idxArr[i * 3 + 2] = tris[i][2];
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(new THREE.BufferAttribute(idxArr, 1));
  return geo;
}
