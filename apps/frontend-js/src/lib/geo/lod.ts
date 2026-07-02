export const CAMERA_DIST = 3;
export const MIN_FOV     = 0.3;
export const MAX_FOV     = 80;
const SLIDER_POWER = 2.5;

export const LEVELS = [
  { fovMin: 20, url: '/geo/natural_earth/110m/cultural/ne_110m_admin_0_countries.geojson' },
  { fovMin: 4,  url: '/geo/natural_earth/50m/cultural/ne_50m_admin_0_countries.geojson' },
  { fovMin: 0,  url: '/geo/natural_earth/10m/cultural/ne_10m_admin_0_countries.geojson' },
] as const;

export function lodForFov(fov: number): 0 | 1 | 2 {
  if (fov > LEVELS[0].fovMin) return 0;
  if (fov > LEVELS[1].fovMin) return 1;
  return 2;
}

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export function sliderToFov(v: number): number {
  return MIN_FOV + Math.pow(1 - v, SLIDER_POWER) * (MAX_FOV - MIN_FOV);
}

export function fovToSlider(fov: number): number {
  return 1 - Math.pow((fov - MIN_FOV) / (MAX_FOV - MIN_FOV), 1 / SLIDER_POWER);
}
