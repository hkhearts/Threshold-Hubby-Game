// Atmosphere: drifting dreamy motes in the celestial light and radiant light shafts
// streaming from the doorway.

import * as THREE from 'three';
import { glowTexture } from './textures.js';

export function buildDust(scene, count = 750) {
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count * 3);
  const basePos = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = (Math.random() - 0.5) * 9.0;
    const y = 0.15 + Math.random() * 4.0;
    const z = -1.8 + Math.random() * 12.0; // covers entire depth up to z=10 around camera
    positions[i * 3 + 0] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    basePos[i * 3 + 0] = x;
    basePos[i * 3 + 1] = y;
    basePos[i * 3 + 2] = z;

    speeds[i * 3 + 0] = 0.3 + Math.random() * 0.7; // sway freq
    speeds[i * 3 + 1] = 0.09 + Math.random() * 0.16; // upward drift speed
    speeds[i * 3 + 2] = Math.random() * Math.PI * 2; // phase offset
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    size: 0.048,
    map: glowTexture(),
    color: 0xf7ca7f,
    transparent: true,
    opacity: 0.65,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  scene.add(points);

  function update(t, dt, intensity) {
    const targetOpacity = 0.52 + Math.min(1, intensity) * 0.42;
    mat.opacity += (targetOpacity - mat.opacity) * (1 - Math.exp(-dt * 2));

    const pos = geo.attributes.position.array;
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      const spdY = speeds[idx + 1];
      const ph = speeds[idx + 2];

      basePos[idx + 1] += dt * spdY;
      if (basePos[idx + 1] > 4.25) basePos[idx + 1] = 0.15;

      pos[idx + 0] = basePos[idx + 0] + Math.sin(t * speeds[idx] + ph) * 0.14;
      pos[idx + 1] = basePos[idx + 1] + Math.cos(t * speeds[idx] * 0.7 + ph) * 0.07;
      pos[idx + 2] = basePos[idx + 2] + Math.sin(t * 0.45 + ph) * 0.09;
    }
    geo.attributes.position.needsUpdate = true;
  }

  return { points, update };
}

export function buildShaft(scene) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd594,
    transparent: true,
    opacity: 0.07,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.5, 4.0, 16, 1, true), mat);
  cone.position.set(-0.4, 1.7, 1.8);
  cone.rotation.x = -0.16;
  cone.rotation.z = 0.32;
  scene.add(cone);

  function update(t, dt, intensity) {
    const target = 0.06 + Math.min(1, intensity) * 0.14;
    mat.opacity += (target - mat.opacity) * (1 - Math.exp(-dt * 2.2));
    cone.rotation.y = Math.sin(t * 0.16) * 0.08;
    cone.scale.x = 1 + 0.06 * Math.sin(t * 0.55);
  }

  return { update };
}
