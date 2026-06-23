'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { GlobeRefLines } from './GlobeRefLines';
import { latLonToVec3, vec3ToLatLon, buildFillGeo, LINE_RADIUS } from '@/lib/geo/geometry';
import { pickCountry } from '@/lib/geo/hit-test';
import { fetchGeo } from '@/lib/geo/fetch';
import { LEVELS, lodForFov, clamp, CAMERA_DIST, MIN_FOV, MAX_FOV } from '@/lib/geo/lod';
import { C_OCEAN, C_LAND, C_BORDER, C_SELECTED } from '@/lib/geo/palette';
import type { GeoCollection } from '@/lib/geo/types';

interface LodData {
  borders: THREE.Group;
  fills: THREE.Group;
  fillMap: Map<string, THREE.Group>;
}

// Shared materials — created once per module load, never disposed
const fillDimMat  = new THREE.MeshBasicMaterial({ color: C_LAND, side: THREE.DoubleSide });
const fillHighMat = new THREE.MeshBasicMaterial({ color: C_SELECTED, side: THREE.DoubleSide });
const borderMat   = new THREE.LineBasicMaterial({ color: C_BORDER, depthTest: true, depthWrite: false });

function buildCountryData(geojson: GeoCollection): LodData {
  const borders = new THREE.Group();
  const fills   = new THREE.Group();
  const fillMap = new Map<string, THREE.Group>();

  for (const feature of geojson.features) {
    const name = String(feature.properties?.NAME ?? feature.properties?.ADMIN ?? 'Unknown');
    const { type, coordinates } = feature.geometry;
    const polys = type === 'Polygon'
      ? [coordinates as number[][][]]
      : coordinates as number[][][][];

    const featureFills = new THREE.Group();

    for (const poly of polys) {
      try {
        const mesh = new THREE.Mesh(buildFillGeo(poly), fillDimMat);
        mesh.renderOrder = 1;
        featureFills.add(mesh);
      } catch {
        // skip degenerate polygons
      }

      for (const ring of poly) {
        const pts  = ring.map(([lon, lat]) => latLonToVec3(lat, lon, LINE_RADIUS));
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          borderMat,
        );
        line.renderOrder = 999;
        borders.add(line);
      }
    }

    fills.add(featureFills);
    fillMap.set(name, featureFills);
  }

  return { borders, fills, fillMap };
}

function applyMat(group: THREE.Group, mat: THREE.Material) {
  for (const child of group.children) (child as THREE.Mesh).material = mat;
}

interface Props {
  onSelect: (name: string | null) => void;
}

export function GlobeScene({ onSelect }: Props) {
  const { scene, camera, gl } = useThree();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  const lodDataRef      = useRef<(LodData | null)[]>([null, null, null]);
  const geojsonsRef     = useRef<(GeoCollection | null)[]>([null, null, null]);
  const loadedRef       = useRef<boolean[]>([false, false, false]);
  const activeLodRef    = useRef(-1);
  const currentLevelRef = useRef(-1);
  const selectedNameRef  = useRef<string | null>(null);
  const selectedGroupRef = useRef<THREE.Group | null>(null);
  const fovRef          = useRef(MAX_FOV);
  const aliveRef        = useRef(true);

  const pc = camera as THREE.PerspectiveCamera;

  // Reset the selected country's fill material in every loaded LOD
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

  const loadLod = useCallback(async (level: number) => {
    if (loadedRef.current[level]) return;
    const geojson = await fetchGeo(LEVELS[level].url);
    if (!aliveRef.current) return; // component unmounted before fetch completed
    const data    = buildCountryData(geojson);
    data.borders.visible = false;
    data.fills.visible   = false;
    scene.add(data.borders);
    scene.add(data.fills);
    lodDataRef.current[level]  = data;
    geojsonsRef.current[level] = geojson;
    loadedRef.current[level]   = true;
    if (lodForFov(fovRef.current) === level) applyLod(level);
  }, [scene, applyLod]);

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

    const level = lodForFov(f);
    if (level !== currentLevelRef.current) {
      currentLevelRef.current = level;
      loadedRef.current[level] ? applyLod(level) : loadLod(level);
    }
  }, [pc, applyLod, loadLod]);

  // Custom wheel handler — zoom via FOV, not camera distance
  useEffect(() => {
    const canvas = gl.domElement;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoom  = 60 / fovRef.current;
      const speed = Math.max(0.15, 2.5 / Math.pow(zoom + 0.5, 0.6));
      setFov(fovRef.current + (e.deltaY > 0 ? speed : -speed));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [gl, setFov]);

  // Bootstrap — setFov already calls loadLod(0) internally via the LOD switch logic
  useEffect(() => {
    setFov(MAX_FOV);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark as dead on unmount so in-flight fetches don't touch the scene
  useEffect(() => {
    return () => { aliveRef.current = false; };
  }, []);

  // Cleanup LOD groups and geometries on unmount
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
}
