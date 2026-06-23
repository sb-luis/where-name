'use client';

import { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { GlobeScene } from './GlobeScene';
import { CAMERA_DIST, MAX_FOV } from '@/lib/geo/lod';

export function Globe() {
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ fov: MAX_FOV, position: [CAMERA_DIST, 0, 0], near: 0.1, far: 100 }}
        gl={{ antialias: true }}
        style={{ width: '100%', height: '100%' }}
      >
        <GlobeScene onSelect={setSelectedCountry} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center">
        {selectedCountry ? (
          <span className="rounded-full bg-white/80 px-4 py-1.5 text-sm font-medium text-gray-800 shadow backdrop-blur-sm">
            {selectedCountry} 
          </span>
        ) : (
          <span className="text-sm text-gray-400">double-click a country</span>
        )}
      </div>
    </div>
  );
}
