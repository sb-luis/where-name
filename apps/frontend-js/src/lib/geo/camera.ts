// Camera-animation math shared by the globe components

// Cubic ease-in-out: slow start, fast middle, slow end. Drives camera
// fly-to transitions (position + FOV interpolation) over a [0, 1] progress.
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export interface OrbitControlsTuning {
  rotateSpeed: number
  dampingFactor: number
}

// OrbitControls feel tuned to the current FOV: faster rotation and more
// damping when zoomed out (high FOV), slower/tighter when zoomed in.
export function orbitControlsTuning(fov: number): OrbitControlsTuning {
  const zoom = 60 / fov
  return {
    rotateSpeed: 0.95 / Math.pow(zoom + 0.5, 1.15),
    dampingFactor: 0.1 + Math.min(zoom / 200, 1) * 0.4,
  }
}

// Screen-space radius (px) of the globe's silhouette, given the camera's
// vertical FOV, the canvas height, and orbit distance.
export function globeScreenRadius(fovDeg: number, viewportHeight: number, cameraDist: number): number {
  const vfovRad = fovDeg * Math.PI / 180
  const ndcR = 1 / (cameraDist * Math.tan(vfovRad / 2))
  return ndcR * viewportHeight / 2
}

// Pulls a screen point back onto the globe's edge (scaled from its center)
// when the point's 3D position isn't currently facing the camera — keeps
// cursors on the far side of the globe pinned to its silhouette instead of
// flying off to their raw (off-globe) projected position.
export function clampToGlobeEdge(
  sx: number, sy: number,
  cx: number, cy: number,
  globeR: number,
  edgePadding = 1.1,
): [number, number] {
  const dx = sx - cx, dy = sy - cy
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist === 0) return [sx, sy]
  const r = (globeR * edgePadding) / dist
  return [cx + dx * r, cy + dy * r]
}
