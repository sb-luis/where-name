'use client';

import { useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { GlobeRefLines } from './GlobeRefLines';
import { vec3ToLatLon } from '@/lib/geo/geometry';
import { pickCountry } from '@/lib/geo/hit-test';
import { fetchGeo } from '@/lib/geo/fetch';
import { LEVELS, lodForFov, clamp, CAMERA_DIST, MIN_FOV, MAX_FOV } from '@/lib/geo/lod';
import { C_OCEAN, C_LAND, C_BORDER, C_SELECTED } from '@/lib/geo/palette';
import type { GeoCollection } from '@/lib/geo/types';
import type { WorkerResponse } from '@/workers/geoBuilder.worker';

interface LodData {
  borders: THREE.Group;
  fills: THREE.Group;
  fillMap: Map<string, THREE.Group>;
}

const fillDimMat  = new THREE.MeshBasicMaterial({ color: C_LAND, side: THREE.DoubleSide });
const fillHighMat = new THREE.MeshBasicMaterial({ color: C_SELECTED, side: THREE.DoubleSide });
const borderMat   = new THREE.LineBasicMaterial({ color: C_BORDER, depthTest: true, depthWrite: false });

function applyMat(group: THREE.Group, mat: THREE.Material) {
  for (const child of group.children) (child as THREE.Mesh).material = mat;
}

// Reconstructs Three.js objects from raw buffer data received from the worker.
// This runs on the main thread but is fast — it only wraps existing typed arrays,
// no triangulation or sphere projection happens here.
function reconstructLodData(response: WorkerResponse): LodData {
  const borders = new THREE.Group();
  const fills   = new THREE.Group();
  const fillMap = new Map<string, THREE.Group>();

  for (const feat of response.features) {
    const featureFills = new THREE.Group();

    for (const { positions, indices } of feat.fills) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setIndex(new THREE.BufferAttribute(indices, 1));
      const mesh = new THREE.Mesh(geo, fillDimMat);
      mesh.renderOrder = 1;
      featureFills.add(mesh);
    }

    fills.add(featureFills);
    fillMap.set(feat.name, featureFills);

    for (const borderPositions of feat.borders) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(borderPositions, 3));
      const line = new THREE.Line(geo, borderMat);
      line.renderOrder = 999;
      borders.add(line);
    }
  }

  return { borders, fills, fillMap };
}

export interface GlobeSceneHandle {
  setFov: (fov: number) => void;
  reset: () => void;
}

interface Props {
  onSelect: (name: string | null) => void;
  onFovChange?: (fov: number) => void;
}

export const GlobeScene = forwardRef<GlobeSceneHandle, Props>(function GlobeScene({ onSelect, onFovChange }, ref) {
  const { scene, camera, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  const workerRef       = useRef<Worker | null>(null);
  const lodDataRef      = useRef<(LodData | null)[]>([null, null, null]);
  const geojsonsRef     = useRef<(GeoCollection | null)[]>([null, null, null]);
  const loadedRef       = useRef<boolean[]>([false, false, false]);
  const buildPromiseRef = useRef<(Promise<void> | null)[]>([null, null, null]);
  const activeLodRef    = useRef(-1);
  const currentLevelRef = useRef(-1);
  const selectedNameRef  = useRef<string | null>(null);
  const selectedGroupRef = useRef<THREE.Group | null>(null);
  const fovRef          = useRef(MAX_FOV);
  const aliveRef        = useRef(true);

  const pc = camera as THREE.PerspectiveCamera;

  const clearSelectionMaterials = useCallback(() => {
    if (!selectedNameRef.current) return;
    for (let i = 0; i < 3; i++) {
      const d = lodDataRef.current[i];
      if (d) {
        const g = d.fillMap.get(selectedNameRef.current!);
        if (g) applyMat(g, fillDimMat);
      }
    }
    selectedGroupRef.current = null;
  }, []);

  const restoreSelection = useCallback((fillMap: Map<string, THREE.Group>) => {
    if (!selectedNameRef.current) return;
    const g = fillMap.get(selectedNameRef.current);
    if (g) { selectedGroupRef.current = g; applyMat(g, fillHighMat); }
  }, []);

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
  }, [clearSelectionMaterials, restoreSelection]);

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

      const data = reconstructLodData(response);
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

  useImperativeHandle(ref, () => ({
    setFov,
    reset() {
      controlsRef.current?.reset();
      setFov(MAX_FOV);
    },
  }), [setFov]);

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
    };
  }, [scene]);

  const handleDoubleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const { lat, lon } = vec3ToLatLon(e.point.clone().normalize());
    const features = geojsonsRef.current[activeLodRef.current]?.features ?? [];
    const name = pickCountry(lon, lat, features);

    clearSelectionMaterials();
    selectedNameRef.current = name;

    if (name) {
      const g = lodDataRef.current[activeLodRef.current]?.fillMap.get(name);
      if (g) { selectedGroupRef.current = g; applyMat(g, fillHighMat); }
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
