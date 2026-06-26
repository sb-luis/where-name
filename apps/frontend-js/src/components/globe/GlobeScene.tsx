'use client';

import { useEffect, useRef, useCallback, useMemo, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { GlobeRefLines } from './GlobeRefLines';
import { vec3ToLatLon } from '@/lib/geo/geometry';
import { pickCountry } from '@/lib/geo/hit-test';
import { fetchGeo } from '@/lib/geo/fetch';
import { LEVELS, lodForFov, clamp, CAMERA_DIST, MIN_FOV, MAX_FOV } from '@/lib/geo/lod';
import { C_OCEAN, C_LAND, C_BORDER, C_SELECTED, C_CORRECT, C_WRONG } from '@/lib/geo/palette';
import type { GeoCollection } from '@/lib/geo/types';
import type { WorkerResponse } from '@/workers/geoBuilder.worker';

interface LodData {
  borders: THREE.Group;
  fills: THREE.Group;
  fillMap: Map<string, THREE.Group>;
}

interface Materials {
  fillDim:    THREE.MeshBasicMaterial;
  fillHigh:   THREE.MeshBasicMaterial;
  fillCorrect: THREE.MeshBasicMaterial;
  fillWrong:  THREE.MeshBasicMaterial;
  border:     THREE.LineBasicMaterial;
}

function applyMat(group: THREE.Group, mat: THREE.Material) {
  for (const child of group.children) (child as THREE.Mesh).material = mat;
}

// Reconstructs Three.js objects from raw buffer data received from the worker.
// This runs on the main thread but is fast — it only wraps existing typed arrays,
// no triangulation or sphere projection happens here.
function reconstructLodData(response: WorkerResponse, mats: Materials): LodData {
  const borders = new THREE.Group();
  const fills   = new THREE.Group();
  const fillMap = new Map<string, THREE.Group>();

  for (const feat of response.features) {
    const featureFills = new THREE.Group();

    for (const { positions, indices } of feat.fills) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      const mesh = new THREE.Mesh(geo, mats.fillDim);
      mesh.renderOrder = 1;
      featureFills.add(mesh);
    }

    fills.add(featureFills);
    fillMap.set(feat.name, featureFills);

    for (const borderPositions of feat.borders) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(borderPositions, 3));
      const line = new THREE.Line(geo, mats.border);
      line.renderOrder = 999;
      borders.add(line);
    }
  }

  return { borders, fills, fillMap };
}

export interface GlobeSceneHandle {
  setFov: (fov: number) => void;
  reset: () => void;
  flyTo: (countryName: string) => void;
  highlightCorrect: (name: string) => void;
  highlightWrong: (name: string) => void;
  clearHighlight: () => void;
}

interface Props {
  onSelect: (name: string | null) => void;
  onFovChange?: (fov: number) => void;
  interactive?: boolean;
}

export const GlobeScene = forwardRef<GlobeSceneHandle, Props>(function GlobeScene({ onSelect, onFovChange, interactive = true }, ref) {
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const { scene, camera, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  const mats = useMemo<Materials>(() => ({
    fillDim:     new THREE.MeshBasicMaterial({ color: C_LAND,     side: THREE.DoubleSide }),
    fillHigh:    new THREE.MeshBasicMaterial({ color: C_SELECTED, side: THREE.DoubleSide }),
    fillCorrect: new THREE.MeshBasicMaterial({ color: C_CORRECT,  side: THREE.DoubleSide }),
    fillWrong:   new THREE.MeshBasicMaterial({ color: C_WRONG,    side: THREE.DoubleSide }),
    border:      new THREE.LineBasicMaterial({ color: C_BORDER,   depthTest: true, depthWrite: false }),
  }), []);

  const workerRef       = useRef<Worker | null>(null);
  const lodDataRef      = useRef<(LodData | null)[]>([null, null, null]);
  const geojsonsRef     = useRef<(GeoCollection | null)[]>([null, null, null]);
  const loadedRef       = useRef<boolean[]>([false, false, false]);
  const buildPromiseRef = useRef<(Promise<void> | null)[]>([null, null, null]);
  const activeLodRef    = useRef(-1);
  const currentLevelRef = useRef(-1);
  const selectedNameRef  = useRef<string | null>(null);
  const selectedGroupRef = useRef<THREE.Group | null>(null);
  const gameHlNameRef    = useRef<string | null>(null);
  const gameHlMatRef     = useRef<THREE.MeshBasicMaterial | null>(null);
  const fovRef          = useRef(MAX_FOV);
  const aliveRef        = useRef(true);
  const flyRafRef       = useRef<number | null>(null);

  const pc = camera as THREE.PerspectiveCamera;

  const clearSelectionMaterials = useCallback(() => {
    if (!selectedNameRef.current) return;
    for (let i = 0; i < 3; i++) {
      const d = lodDataRef.current[i];
      if (d) {
        const g = d.fillMap.get(selectedNameRef.current!);
        if (g) applyMat(g, mats.fillDim);
      }
    }
    selectedGroupRef.current = null;
  }, []);

  const restoreSelection = useCallback((fillMap: Map<string, THREE.Group>) => {
    if (!selectedNameRef.current) return;
    const g = fillMap.get(selectedNameRef.current);
    if (g) { selectedGroupRef.current = g; applyMat(g, mats.fillHigh); }
  }, []);

  const clearGameHighlight = useCallback(() => {
    if (!gameHlNameRef.current) return;
    for (let i = 0; i < 3; i++) {
      const d = lodDataRef.current[i];
      if (d) {
        const g = d.fillMap.get(gameHlNameRef.current!);
        if (g) applyMat(g, mats.fillDim);
      }
    }
    gameHlNameRef.current = null;
    gameHlMatRef.current  = null;
  }, []);

  const restoreGameHighlight = useCallback((fillMap: Map<string, THREE.Group>) => {
    if (!gameHlNameRef.current || !gameHlMatRef.current) return;
    const g = fillMap.get(gameHlNameRef.current);
    if (g) applyMat(g, gameHlMatRef.current);
  }, []);

  const setGameHighlight = useCallback((name: string, mat: THREE.MeshBasicMaterial) => {
    clearGameHighlight();
    gameHlNameRef.current = name;
    gameHlMatRef.current  = mat;
    for (let i = 0; i < 3; i++) {
      const d = lodDataRef.current[i];
      if (d) {
        const g = d.fillMap.get(name);
        if (g) applyMat(g, mat);
      }
    }
  }, [clearGameHighlight]);

  const applyLod = useCallback((level: number) => {
    const data = lodDataRef.current[level];
    if (!data) return;

    // Hide every loaded LOD that isn't the one we're activating
    for (let i = 0; i < 3; i++) {
      if (i === level) continue;
      const d = lodDataRef.current[i];
      if (d) { d.borders.visible = false; d.fills.visible = false; }
    }
    clearSelectionMaterials();
    activeLodRef.current = level;
    data.borders.visible = true;
    data.fills.visible   = true;
    restoreSelection(data.fillMap);
    restoreGameHighlight(data.fillMap);
  }, [clearSelectionMaterials, restoreSelection, restoreGameHighlight]);

  // Sends geojson to the worker and resolves with the geometry response.
  // Multiple callers for the same level share one in-flight Promise via buildPromiseRef.
  const loadLod = useCallback((level: number): Promise<void> => {
    if (loadedRef.current[level]) return Promise.resolve();
    if (buildPromiseRef.current[level]) return buildPromiseRef.current[level]!;

    buildPromiseRef.current[level] = (async () => {
      const worker = workerRef.current;
      if (!worker) return;

      const geojson = await fetchGeo(LEVELS[level].url);
      if (!aliveRef.current) return;

      // All heavy computation (tessellation, subdivision, sphere projection) runs
      // in the worker — off the main thread — so the render loop is never blocked.
      const response = await new Promise<WorkerResponse>((resolve, reject) => {
        const onMessage = (e: MessageEvent<WorkerResponse>) => {
          if (e.data.level !== level) return;
          cleanup();
          resolve(e.data);
        };
        const onError = (e: ErrorEvent) => {
          cleanup();
          reject(new Error(`Geo worker error: ${e.message}`));
        };
        const cleanup = () => {
          worker.removeEventListener('message', onMessage);
          worker.removeEventListener('error', onError);
        };
        worker.addEventListener('message', onMessage);
        worker.addEventListener('error', onError);
        worker.postMessage({ level, geojson });
      });

      if (!aliveRef.current) return;

      const data = reconstructLodData(response, mats);
      data.borders.visible = false;
      data.fills.visible   = false;
      scene.add(data.borders);
      scene.add(data.fills);
      lodDataRef.current[level]  = data;
      geojsonsRef.current[level] = geojson;
      loadedRef.current[level]   = true;

      if (lodForFov(fovRef.current) === level) applyLod(level);
    })();

    return buildPromiseRef.current[level]!;
  }, [scene, applyLod]);

  const onFovChangeRef = useRef(onFovChange);
  useEffect(() => { onFovChangeRef.current = onFovChange; }, [onFovChange]);

  const setFov = useCallback((fov: number) => {
    const f = clamp(fov, MIN_FOV, MAX_FOV);
    fovRef.current = f;
    pc.fov = f;
    pc.updateProjectionMatrix();

    const zoom = 60 / f;
    if (controlsRef.current) {
      controlsRef.current.rotateSpeed   = 0.95 / Math.pow(zoom + 0.5, 1.15);
      controlsRef.current.dampingFactor = 0.1 + Math.min(zoom / 200, 1) * 0.4;
    }

    onFovChangeRef.current?.(f);

    const level = lodForFov(f);
    if (level !== currentLevelRef.current) {
      currentLevelRef.current = level;
      loadedRef.current[level] ? applyLod(level) : loadLod(level);
    }
  }, [pc, applyLod, loadLod]);

  const animateTo = useCallback((targetDir: THREE.Vector3, targetFov: number) => {
    if (flyRafRef.current !== null) {
      cancelAnimationFrame(flyRafRef.current);
      flyRafRef.current = null;
    }

    const startPos  = pc.position.clone();
    const startFov  = fovRef.current;
    const duration  = 1200;
    const startTime = performance.now();

    const controls = controlsRef.current;
    if (controls) controls.enabled = false;

    const tick = () => {
      const raw  = Math.min((performance.now() - startTime) / duration, 1);
      const tArc = raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;

      const dir = startPos.clone().normalize().lerp(targetDir, tArc).normalize();
      pc.position.copy(dir.multiplyScalar(CAMERA_DIST));
      pc.lookAt(0, 0, 0);

      setFov(clamp(startFov + (targetFov - startFov) * tArc, MIN_FOV, MAX_FOV));

      if (raw < 1) {
        flyRafRef.current = requestAnimationFrame(tick);
      } else {
        flyRafRef.current = null;
        if (controls) { controls.enabled = true; controls.update(); }
      }
    };
    flyRafRef.current = requestAnimationFrame(tick);
  }, [pc, setFov]);

  const flyTo = useCallback((countryName: string) => {
    let centroid: { lat: number; lon: number } | null = null;
    for (const geo of geojsonsRef.current) {
      if (!geo) continue;
      const feat = geo.features.find(f => {
        const n = String(f.properties?.NAME ?? f.properties?.ADMIN ?? '');
        return n === countryName;
      });
      if (!feat) continue;

      const polys = feat.geometry.type === 'Polygon'
        ? [feat.geometry.coordinates as number[][][]]
        : feat.geometry.coordinates as number[][][][];

      let ring = polys[0][0];
      for (const poly of polys) {
        if (poly[0].length > ring.length) ring = poly[0];
      }
      let sumLon = 0, sumLat = 0;
      for (const [lon, lat] of ring) { sumLon += lon; sumLat += lat; }
      centroid = { lat: sumLat / ring.length, lon: sumLon / ring.length };
      break;
    }
    if (!centroid) return;

    const phi = (90 - centroid.lat) * (Math.PI / 180);
    const theta = (centroid.lon + 180) * (Math.PI / 180);
    const targetDir = new THREE.Vector3(
      -Math.sin(phi) * Math.cos(theta),
       Math.cos(phi),
       Math.sin(phi) * Math.sin(theta),
    );
    animateTo(targetDir, 35);
  }, [animateTo]);

  // Initial camera position direction: [CAMERA_DIST, 0, 0] → normalized [1, 0, 0]
  const HOME_DIR = new THREE.Vector3(1, 0, 0);

  useImperativeHandle(ref, () => ({
    setFov,
    reset() { animateTo(HOME_DIR, MAX_FOV); },
    flyTo,
    highlightCorrect: (name: string) => setGameHighlight(name, mats.fillCorrect),
    highlightWrong:   (name: string) => setGameHighlight(name, mats.fillWrong),
    clearHighlight:   clearGameHighlight,
  }), [setFov, flyTo, setGameHighlight, clearGameHighlight, mats]);

  // Create worker before the bootstrap effect so workerRef is populated when loadLod runs.
  useEffect(() => {
    const worker = new Worker(
      new URL('../../workers/geoBuilder.worker.ts', import.meta.url),
    );
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Geometric zoom: fov *= ratio, so total zoom = product of all ratios = finalDist/initialDist.
  // This is frame-rate independent — result is the same whether 10 or 60 events fire.
  const zoomByRatio = useCallback((ratio: number) => {
    setFov(fovRef.current * ratio);
  }, [setFov]);

  // Wheel: normalize deltaY across deltaMode (pixels/lines/pages) then convert to a ratio.
  useEffect(() => {
    const canvas = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const pixels = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 600 : 1);
      zoomByRatio(Math.exp(pixels * 0.0008));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [gl, zoomByRatio]);

  // Pinch-to-zoom: detect two-finger pinch and convert distance change to zoom ratio.
  useEffect(() => {
    const canvas = gl.domElement;
    let prevPinchDist = 0;

    const getTouchDistance = (touches: TouchList): number => {
      if (touches.length < 2) return 0;
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        prevPinchDist = getTouchDistance(e.touches);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const currentDist = getTouchDistance(e.touches);
        if (prevPinchDist > 0) {
          const ratio = currentDist / prevPinchDist;
          zoomByRatio(1 / ratio);
        }
        prevPinchDist = currentDist;
      }
    };

    const onTouchEnd = () => {
      prevPinchDist = 0;
    };

    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
  }, [gl, zoomByRatio]);

  // Bootstrap: trigger LOD 0, then pre-build LODs 1 and 2 in the worker while the
  // user interacts. All computation is off-thread 
  useEffect(() => {
    setFov(MAX_FOV);
    const preload = async () => {
      await loadLod(0);
      if (!aliveRef.current) return;
      await loadLod(1);
      if (!aliveRef.current) return;
      await loadLod(2);
    };
    preload();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => { aliveRef.current = false; };
  }, []);

  useEffect(() => {
    return () => {
      for (const data of lodDataRef.current) {
        if (!data) continue;
        scene.remove(data.borders);
        scene.remove(data.fills);
        data.borders.traverse(obj => {
          if (obj instanceof THREE.Line) obj.geometry.dispose();
        });
        data.fills.traverse(obj => {
          if (obj instanceof THREE.Mesh) obj.geometry.dispose();
        });
      }
      mats.fillDim.dispose();
      mats.fillHigh.dispose();
      mats.fillCorrect.dispose();
      mats.fillWrong.dispose();
      mats.border.dispose();
    };
  }, [scene, mats]);

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    if (!interactiveRef.current) return;
    e.stopPropagation();
    const { lat, lon } = vec3ToLatLon(e.point.clone().normalize());
    const features = geojsonsRef.current[activeLodRef.current]?.features ?? [];
    const name = pickCountry(lon, lat, features);

    clearSelectionMaterials();
    selectedNameRef.current = name;

    if (name) {
      const g = lodDataRef.current[activeLodRef.current]?.fillMap.get(name);
      if (g) { selectedGroupRef.current = g; applyMat(g, mats.fillHigh); }
    }

    onSelect(name);
  }, [onSelect, clearSelectionMaterials]);

  return (
    <>
      <color attach="background" args={['#f3f3f3']} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        enableZoom={false}
        enablePan={false}
        minDistance={CAMERA_DIST}
        maxDistance={CAMERA_DIST}
      />
      <mesh onDoubleClick={handleDoubleClick}>
        <sphereGeometry args={[1, 64, 64]} />
        <meshBasicMaterial color={C_OCEAN} />
      </mesh>
      <GlobeRefLines />
    </>
  );
});
