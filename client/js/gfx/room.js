// The warm room behind the door: fireplace, armchair, rug, bookshelf, moonlit
// window, hanging lamp, and a plant. Lights start at zero and bloom open as
// the door does.

import * as THREE from 'three';
import { woodTexture, stoneTexture, glowTexture } from './textures.js';
import { flicker } from './hallway.js';

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function buildRoom(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const floorWood = woodTexture({ base: '#edd9c3', dark: '#d8bfa2', light: '#faf2e8' });
  const wallMat = new THREE.MeshStandardMaterial({ map: stoneTexture({ base: '#f3ebe2', hi: '#fbf7f1', lo: '#e7dbcd' }), color: 0xf5efe8, roughness: 0.9 });

  // shell
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ map: floorWood, color: 0xf5ebe0, roughness: 0.6, metalness: 0.04 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.02, -4);
  floor.receiveShadow = true;
  root.add(floor);

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12, 8), new THREE.MeshStandardMaterial({ color: 0xf4ece3, roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, 4.3, -4);
  root.add(ceil);

  root.add(box(12, 4.3, 0.5, wallMat, 0, 2.15, -8));
  root.add(box(0.5, 4.3, 8, wallMat, -6, 2.15, -4));
  root.add(box(0.5, 4.3, 8, wallMat, 6, 2.15, -4));

  // ceiling beams
  const beamMat = new THREE.MeshStandardMaterial({ map: floorWood, color: 0xdebfa6, roughness: 0.6 });
  root.add(box(0.18, 0.14, 8, beamMat, -2.2, 4.22, -4));
  root.add(box(0.18, 0.14, 8, beamMat, 2.2, 4.22, -4));

  // rug — soft rose-peach velvet
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.0, 24), new THREE.MeshStandardMaterial({ color: 0xdeb49e, roughness: 0.9 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.15, 0.032, -3.1);
  rug.receiveShadow = true;
  root.add(rug);
  const rugIn = new THREE.Mesh(new THREE.CircleGeometry(1.25, 24), new THREE.MeshStandardMaterial({ color: 0xedd0c0, roughness: 0.9 }));
  rugIn.rotation.x = -Math.PI / 2;
  rugIn.position.set(0.15, 0.036, -3.1);
  root.add(rugIn);

  // ---- fireplace -----------------------------------------------------------
  const stone = new THREE.MeshStandardMaterial({ color: 0xf2eae1, roughness: 0.85 });
  const fireGroup = new THREE.Group();
  fireGroup.position.set(1.7, 0, -6.7);
  root.add(fireGroup);

  fireGroup.add(box(1.7, 0.28, 0.85, stone, 0, 0.14, 0));
  fireGroup.add(box(1.5, 1.55, 0.7, stone, 0, 1.0, 0));
  fireGroup.add(box(0.95, 2.1, 0.6, stone, 0, 3.0, 0)); // chimney
  fireGroup.add(box(1.85, 0.07, 0.5, new THREE.MeshStandardMaterial({ map: floorWood, color: 0x8a6a44, roughness: 0.7 }), 0, 1.85, 0.28)); // mantel

  const fireInner = box(1.05, 1.0, 0.5, new THREE.MeshStandardMaterial({ color: 0x0a0806, roughness: 1 }), 0, 0.8, -0.12);
  fireGroup.add(fireInner);

  const fireGlowMat = new THREE.MeshBasicMaterial({
    color: 0xff7a2f,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const fireGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.85), fireGlowMat);
  fireGlow.position.set(0, 0.78, -0.34);
  fireGroup.add(fireGlow);

  const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2414, roughness: 1 });
  const log1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 8), logMat);
  log1.rotation.z = Math.PI / 2;
  log1.position.set(-0.1, 0.34, -0.25);
  fireGroup.add(log1);
  const log2 = log1.clone();
  log2.position.set(0.12, 0.4, -0.25);
  log2.rotation.z = Math.PI / 2 + 0.5;
  fireGroup.add(log2);

  const flames = [];
  const flameMatBase = new THREE.MeshBasicMaterial({ color: 0xff8c3a, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.09 - i * 0.02, 0.3 + i * 0.12, 6), flameMatBase);
    f.position.set(-0.22 + i * 0.22, 0.62 + i * 0.08, -0.28);
    fireGroup.add(f);
    flames.push(f);
  }

  const fireLight = new THREE.PointLight(0xff8c3a, 0, 9, 2);
  fireLight.position.set(1.7, 1.05, -6.35);
  fireLight.castShadow = true;
  fireLight.shadow.mapSize.set(512, 512);
  fireLight.shadow.bias = -0.0006;
  root.add(fireLight);

  // ---- armchair --------------------------------------------------------------
  const chairMat = new THREE.MeshStandardMaterial({ color: 0x4a2320, roughness: 0.95 });
  const chair = new THREE.Group();
  chair.position.set(-2.3, 0, -4.3);
  chair.rotation.y = 0.35;
  root.add(chair);
  chair.add(box(0.9, 0.32, 0.85, chairMat, 0, 0.52, 0));
  chair.add(box(0.9, 0.95, 0.24, chairMat, 0, 1.12, -0.32));
  chair.add(box(0.18, 0.42, 0.85, chairMat, -0.42, 0.66, 0));
  chair.add(box(0.18, 0.42, 0.85, chairMat, 0.42, 0.66, 0));
  chair.add(box(0.84, 0.18, 0.75, new THREE.MeshStandardMaterial({ color: 0x5c2b26, roughness: 0.95 }), 0, 0.74, -0.02));

  // side table
  const table = new THREE.Group();
  table.position.set(0.55, 0, -4.15);
  root.add(table);
  table.add(box(0.55, 0.05, 0.55, new THREE.MeshStandardMaterial({ map: floorWood, color: 0x8a6a44, roughness: 0.7 }), 0, 0.55, 0));
  table.add(box(0.06, 0.55, 0.06, new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 0.8 }), -0.2, 0.27, -0.2));
  table.add(box(0.06, 0.55, 0.06, new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 0.8 }), 0.2, 0.27, 0.2));

  // ---- hanging lamp -----------------------------------------------------------
  const lampCord = box(0.02, 1.55, 0.02, new THREE.MeshStandardMaterial({ color: 0x11131a, roughness: 0.9 }), -1.35, 3.5, -3.4);
  root.add(lampCord);
  const shadeMat = new THREE.MeshBasicMaterial({ color: 0xffc98f, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.32, 14, 1, true), shadeMat);
  shade.position.set(-1.35, 2.72, -3.4);
  root.add(shade);
  const lampLight = new THREE.PointLight(0xffc98f, 0, 6, 2);
  lampLight.position.set(-1.35, 2.5, -3.4);
  root.add(lampLight);

  // ---- bookshelf ----------------------------------------------------------------
  const shelf = new THREE.Group();
  shelf.position.set(-5.62, 0, -5.2);
  root.add(shelf);
  shelf.add(box(2.1, 2.5, 0.4, new THREE.MeshStandardMaterial({ map: floorWood, color: 0x6e5234, roughness: 0.75 }), 0, 1.25, 0));
  const shelfBoard = new THREE.MeshStandardMaterial({ map: floorWood, color: 0x7a5c3a, roughness: 0.75 });
  for (let i = 1; i < 5; i++) shelf.add(box(2.0, 0.05, 0.34, shelfBoard, 0, i * 0.5, 0.04));

  const bookColors = [0x7a4a3a, 0x3f5a4a, 0x4a4a66, 0x6e5a3a, 0x56304a, 0x33566e, 0x6e3a30, 0x3a5e56];
  for (let i = 0; i < 22; i++) {
    const row = 1 + Math.floor(i / 6);
    const col = i % 6;
    const bw = 0.11 + Math.random() * 0.06;
    const bh = 0.26 + Math.random() * 0.16;
    const book = new THREE.Mesh(
      new THREE.BoxGeometry(0.26, bh, bw),
      new THREE.MeshStandardMaterial({ color: bookColors[i % bookColors.length], roughness: 0.85, metalness: 0.05 })
    );
    book.position.set(-0.82 + col * 0.32, row * 0.5 + bh / 2, 0.2);
    book.rotation.y = Math.PI / 2;
    shelf.add(book);
  }

  // ---- window with stars ----------------------------------------------------------
  const win = new THREE.Group();
  win.position.set(5.72, 2.25, -3.3);
  root.add(win);

  const frameMat = new THREE.MeshStandardMaterial({ map: floorWood, color: 0x5e4528, roughness: 0.8 });
  win.add(box(0.08, 1.7, 0.06, frameMat, 0, 0, 0));
  win.add(box(0.08, 1.7, 0.06, frameMat, 0, 0, 1.25));
  win.add(box(1.32, 0.08, 0.06, frameMat, 0, 0.8, 0.625));
  win.add(box(1.32, 0.08, 0.06, frameMat, 0, -0.8, 0.625));
  win.add(box(0.03, 1.62, 0.02, frameMat, 0, 0, 0.625));
  win.add(box(1.24, 0.03, 0.02, frameMat, 0, 0, 0.625));

  const pane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.18, 1.54),
    new THREE.MeshBasicMaterial({ color: 0x0a1428 })
  );
  pane.position.set(0.01, 0, 0.625);
  pane.rotation.y = -Math.PI / 2;
  win.add(pane);

  const moon = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), new THREE.MeshBasicMaterial({ color: 0xdfe8ff }));
  moon.position.set(0.012, 0.42, 0.86);
  moon.rotation.y = -Math.PI / 2;
  win.add(moon);

  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 70; i++) {
    starPos.push(0.012, -0.72 + Math.random() * 1.42, 0.15 + Math.random() * 0.98);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(starPos), 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xcfe0ff,
    size: 2.4,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  win.add(stars);

  const windowLight = new THREE.PointLight(0x8fb4ff, 0, 4.5, 2);
  windowLight.position.set(5.0, 2.3, -3.3);
  root.add(windowLight);

  // ---- plant -----------------------------------------------------------------------
  const plant = new THREE.Group();
  plant.position.set(-3.4, 0, -1.7);
  root.add(plant);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.15, 0.32, 10), new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.85 }));
  pot.position.y = 0.16;
  plant.add(pot);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 0.9 });
  for (let i = 0; i < 4; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 6), leafMat);
    leaf.position.set(Math.cos(i * 1.7) * 0.08, 0.52 + (i % 2) * 0.12, Math.sin(i * 1.7) * 0.08);
    leaf.rotation.z = Math.cos(i * 1.7) * 0.35;
    leaf.rotation.x = Math.sin(i * 1.7) * 0.35;
    plant.add(leaf);
  }

  // warm ambient that only exists once the door is open
  const roomWarm = new THREE.PointLight(0xffc08a, 0, 16, 2);
  roomWarm.position.set(0, 2.6, -3.2);
  root.add(roomWarm);

  let open = 0;

  function update(t, dt, openTarget = 0) {
    open += (openTarget - open) * (1 - Math.exp(-dt * 1.4));

    const f = 0.86 + 0.14 * flicker(t * 8.4);
    fireLight.intensity = open * (3.3 + 0.75 * flicker(t * 9.1) + 0.25 * flicker(t * 23.0));
    fireGlowMat.opacity = open * (0.6 + 0.3 * flicker(t * 7.7));
    for (let i = 0; i < flames.length; i++) {
      flames[i].scale.y = 0.85 + 0.35 * flicker(t * 9.7 + i * 5.1);
      flames[i].material.opacity = open * (0.55 + 0.25 * flicker(t * 8.2 + i * 3.3));
    }
    lampLight.intensity = open * 1.9;
    shadeMat.opacity = open * (0.4 + 0.08 * Math.sin(t * 1.3));
    windowLight.intensity = open * 0.6;
    starMat.opacity = open * (0.6 + 0.2 * Math.sin(t * 1.4));
    roomWarm.intensity = open * 2.2;
  };

  return {
    root,
    lights: { fire: fireLight, lamp: lampLight, window: windowLight, warm: roomWarm },
    fireGlowMat,
    starMat,
    update,
  };
}
