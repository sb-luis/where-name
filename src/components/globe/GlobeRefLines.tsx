'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { latLonToVec3, LINE_RADIUS } from '@/lib/geo/geometry';
import { C_REF_LINE } from '@/lib/geo/palette';

const SEGMENTS = 128;

function makeLatLine(lat: number, mat: THREE.LineBasicMaterial): THREE.Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= SEGMENTS; i++)
    pts.push(latLonToVec3(lat, -180 + (360 * i) / SEGMENTS, LINE_RADIUS));
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

function makeMeridian(lon: number, mat: THREE.LineBasicMaterial): THREE.Line {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= SEGMENTS / 2; i++)
    pts.push(latLonToVec3(-90 + (180 * i) / (SEGMENTS / 2), lon, LINE_RADIUS));
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat);
}

export function GlobeRefLines() {
  const group = useMemo(() => {
    const g = new THREE.Group();

    const accentMat = new THREE.LineBasicMaterial({
      color: C_REF_LINE, transparent: true, opacity: 0.2,
      depthTest: true, depthWrite: false,
    });
    const dimMat = new THREE.LineBasicMaterial({
      color: C_REF_LINE, transparent: true, opacity: 0.08,
      depthTest: true, depthWrite: false,
    });

    g.add(makeLatLine(0, accentMat));
    g.add(makeMeridian(0, accentMat));
    g.add(makeMeridian(180, accentMat));

    for (let lon = -150; lon < 180; lon += 30) {
      if (lon === 0) continue;
      g.add(makeMeridian(lon, dimMat));
    }
    for (let lat = -60; lat <= 60; lat += 30) {
      if (lat === 0) continue;
      g.add(makeLatLine(lat, dimMat));
    }

    return g;
  }, []);

  return <primitive object={group} />;
}
