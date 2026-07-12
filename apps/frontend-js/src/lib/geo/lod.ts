export const CAMERA_DIST = 3;
export const MIN_FOV     = 0.3;
export const REVEAL_MIN_FOV = 0.15;
export const MAX_FOV     = 80;
// Pull-back FOV for reveal transitions: how far the camera zooms out mid-flight before settling on the target.
export const MIN_ORBITING_FOV = 25;
const SLIDER_POWER = 2.5;

const CDN = 'https://natural-earth-cdn.luis-sb.workers.dev';

export const LEVELS = [
  { fovMin: 20, url: `${CDN}/110m/cultural/ne_110m_admin_0_countries.geojson` },
  { fovMin: 4,  url: `${CDN}/50m/cultural/ne_50m_admin_0_countries.geojson` },
  { fovMin: 0,  url: `${CDN}/10m/cultural/ne_10m_admin_0_countries.geojson` },
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
  const clamped = clamp(fov, MIN_FOV, MAX_FOV);
  return 1 - Math.pow((clamped - MIN_FOV) / (MAX_FOV - MIN_FOV), 1 / SLIDER_POWER);
}
