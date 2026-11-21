// Renderer, scene, camera, and the bloom post-processing chain.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export function createEngine(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6efe6);
  // Crisp clear courtyard visibility; subtle dreamy mist only at distant horizon
  scene.fog = new THREE.Fog(0xf6efe6, 38, 95);

  const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 70);
  camera.position.set(0.9, 1.75, 8.6);
  camera.lookAt(0, 1.55, 0);
  scene.add(camera);

  // Lighting skeleton — clear ambient & soft directional sun
  const ambient = new THREE.AmbientLight(0xfff7ed, 1.15);
  const hemi = new THREE.HemisphereLight(0xffeedd, 0xd0bfad, 0.95);
  scene.add(ambient, hemi);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Controlled bloom: only intense light sparks glow, items remain solid & clearly visible
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.22, // strength (toned down so items don't glow)
    0.45, // radius
    0.93 // threshold (only bright highlights)
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  }
  window.addEventListener('resize', resize);

  return { renderer, scene, camera, composer, bloom, resize };
}
