// The hallway: stone shell, the tall wooden door with its three brass locks,
// the keyhole that pulses with the player's arterial pressure trace, the line
// of light under the door, wall sconces, and the cold "workday" glow at the
// far end. Everything is procedural low-poly geometry.

import * as THREE from 'three';
import { woodTexture, stoneTexture } from './textures.js';
import { addBlackOutline, addEdgeOutline } from './outline.js';

const BRASS = { color: 0xdf9e38, metalness: 0.88, roughness: 0.25 };
const DARK_BRASS = { color: 0xbe7f26, metalness: 0.85, roughness: 0.3 };
const IRON = { color: 0x5a483a, metalness: 0.6, roughness: 0.4 };

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

function glowPlane(w, h, color, opacity, additive = true) {
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    ...(additive ? { blending: THREE.AdditiveBlending } : {}),
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

// Cheap layered-sine flicker noise (deterministic, no state).
export function flicker(x) {
  return (
    Math.sin(x * 1.0) * 0.5 +
    Math.sin(x * 1.7 + 1.3) * 0.3 +
    Math.sin(x * 2.9 + 4.1) * 0.2
  );
}

export function buildHallway(scene) {
  const root = new THREE.Group();
  scene.add(root);

  const woodTex = woodTexture();
  const stoneTex = stoneTexture();

  const stoneWall = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xf3ebe1, roughness: 0.85, metalness: 0.02 });
  const stoneFloor = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xf8f1e7, roughness: 0.6, metalness: 0.04 });
  const stoneCeil = new THREE.MeshStandardMaterial({ map: stoneTex, color: 0xede0d0, roughness: 0.9, metalness: 0.02 });
  const frameWood = new THREE.MeshStandardMaterial({ map: woodTex, color: 0xc49b74, roughness: 0.6, metalness: 0.06 });
  const brass = new THREE.MeshStandardMaterial(BRASS);
  const darkBrass = new THREE.MeshStandardMaterial(DARK_BRASS);
  const iron = new THREE.MeshStandardMaterial(IRON);

  // ---- shell ----------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 15), stoneFloor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 7.5);
  floor.receiveShadow = true;
  root.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(12, 15), stoneCeil);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, 4.3, 7.5);
  root.add(ceiling);

  root.add(box(0.5, 4.3, 15, stoneWall, -6, 2.15, 7.5));
  root.add(box(0.5, 4.3, 15, stoneWall, 6, 2.15, 7.5));
  root.add(box(12, 4.3, 0.5, stoneWall, 0, 2.15, 15)); // far wall (the work end)

  // carpet runner toward the door — warm rose-terracotta velvet
  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 11.5),
    new THREE.MeshStandardMaterial({ color: 0xc8987d, roughness: 0.85, metalness: 0 })
  );
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, 0.012, 7.4);
  runner.receiveShadow = true;
  root.add(runner);

  // ---- door wall (cleanly snapped with ZERO overlaps) -------------------
  // Opening is exactly 1.56m wide, centered at x = 0 (from x = -0.78 to +0.78)
  const wallL = box(5.22, 4.3, 0.6, stoneWall, -3.39, 2.15, 0); // from -6.0 to -0.78
  const wallR = box(5.22, 4.3, 0.6, stoneWall, 3.39, 2.15, 0);  // from +0.78 to +6.0
  const wallTop = box(1.56, 0.82, 0.6, stoneWall, 0, 3.89, 0);   // from y = 3.48 to 4.30 only over opening
  root.add(wallL, wallR, wallTop);

  // door frame & celestial portal trim snapped cleanly around opening
  const jambL = box(0.10, 3.48, 0.62, frameWood, -0.83, 1.74, 0);
  const jambR = box(0.10, 3.48, 0.62, frameWood, 0.83, 1.74, 0);
  const jambTop = box(1.76, 0.12, 0.64, frameWood, 0, 3.54, 0);
  root.add(jambL, jambR, jambTop);
  addEdgeOutline(jambL);
  addEdgeOutline(jambR);
  addEdgeOutline(jambTop);

  // gilded portal arch pillars with ink borders on courtyard facade
  const pillarL = box(0.08, 3.48, 0.08, brass, -0.84, 1.74, 0.33);
  const pillarR = box(0.08, 3.48, 0.08, brass, 0.84, 1.74, 0.33);
  const archTop = box(1.76, 0.08, 0.08, brass, 0, 3.52, 0.33);
  root.add(pillarL, pillarR, archTop);
  addEdgeOutline(pillarL);
  addEdgeOutline(pillarR);
  addEdgeOutline(archTop);

  // Solid doorway veil behind the frame (placed at z = -0.15 to prevent any z-fighting with the door)
  const sealMat = new THREE.MeshBasicMaterial({ color: 0x140e08, side: THREE.DoubleSide });
  const doorSeal = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 3.46), sealMat);
  doorSeal.position.set(0, 1.74, -0.15);
  root.add(doorSeal);

  // ---- the door (hinge at x = -0.77, centered at x = 0 when closed) ----
  const door = new THREE.Group();
  door.position.set(-0.77, 0, 0);
  root.add(door);

  const DOOR_W = 1.54;
  const DOOR_H = 3.44;
  const PLANKS = 6;
  const PLANK_W = DOOR_W / PLANKS; // 0.2566m
  const planks = [];
  const plankMats = [];

  // Solid 100% opaque core slab — single solid piece, perfectly outlined
  const doorCore = new THREE.Mesh(
    new THREE.BoxGeometry(DOOR_W, DOOR_H, 0.06),
    new THREE.MeshStandardMaterial({
      map: woodTex,
      color: 0x3d2b1f,
      roughness: 0.85,
    })
  );
  doorCore.position.set(DOOR_W / 2, 1.74, 0);
  door.add(doorCore);
  addEdgeOutline(doorCore);

  // Decorative wood relief planks with clean 4mm dark shadow grooves
  for (let i = 0; i < PLANKS; i++) {
    const mat = new THREE.MeshStandardMaterial({
      map: woodTex,
      color: new THREE.Color(0.84 + (i % 3) * 0.02, 0.70 + (i % 2) * 0.02, 0.54),
      roughness: 0.6,
      metalness: 0.04,
    });
    const plank = new THREE.Mesh(new THREE.BoxGeometry(PLANK_W - 0.006, DOOR_H - 0.02, 0.018), mat);
    plank.position.set(PLANK_W / 2 + i * PLANK_W, 1.74, 0.038);
    plank.castShadow = true;
    plank.receiveShadow = true;
    door.add(plank);
    planks.push(plank);
    plankMats.push(mat);
  }

  // hinges + knob
  const hinge1 = box(0.04, 0.16, 0.035, darkBrass, 0.02, 2.95, 0.045);
  const hinge2 = box(0.04, 0.16, 0.035, darkBrass, 0.02, 0.45, 0.045);
  door.add(hinge1, hinge2);
  addEdgeOutline(hinge1);
  addEdgeOutline(hinge2);

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), brass);
  knob.position.set(1.38, 1.15, 0.08);
  door.add(knob);
  addBlackOutline(knob);

  // ---- keyhole -----------------------------------------------------------
  const keyhole = new THREE.Group();
  keyhole.position.set(0.96, 1.35, 0.048);
  door.add(keyhole);

  const escutcheon = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.02, 24), brass);
  escutcheon.rotation.x = Math.PI / 2;
  keyhole.add(escutcheon);
  addEdgeOutline(escutcheon);

  const hole = new THREE.Mesh(
    new THREE.CircleGeometry(0.03, 20),
    new THREE.MeshBasicMaterial({ color: 0x05070b })
  );
  hole.position.z = 0.012;
  keyhole.add(hole);

  const keyGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffb066,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const keyGlow = new THREE.Mesh(new THREE.CircleGeometry(0.028, 20), keyGlowMat);
  keyGlow.position.z = 0.011;
  keyhole.add(keyGlow);

  const keyLight = new THREE.PointLight(0xffb066, 0, 2.0, 2);
  keyLight.position.set(0.96, 1.35, 0.22);
  door.add(keyLight);

  // ---- the three locks ----------------------------------------------------
  const locks = [];
  const LOCK_Y = [1.62, 1.3, 0.98];
  for (let i = 0; i < 3; i++) {
    const lock = new THREE.Group();
    lock.position.set(1.32, LOCK_Y[i], 0.048);
    door.add(lock);

    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.025), brass);
    plate.position.z = 0.015;
    lock.add(plate);
    addEdgeOutline(plate);

    const keyway = new THREE.Group();
    keyway.position.z = 0.035;
    lock.add(keyway);

    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 18), darkBrass);
    cyl.rotation.x = Math.PI / 2;
    keyway.add(cyl);
    addEdgeOutline(cyl);

    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.11, 0.035), iron);
    keyway.add(slot);

    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xffb066,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.011, 8, 24), glowMat);
    ring.position.z = 0.055;
    lock.add(ring);

    locks.push({ group: lock, keyway, glowMat, plate });
  }

  // ---- the light under the door -------------------------------------------
  const crackGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffb86b,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const crackGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.46, 0.16), crackGlowMat);
  crackGlow.position.set(0, 0.085, 0.02);
  root.add(crackGlow);

  const crackBigMat = new THREE.MeshBasicMaterial({
    color: 0xffaa5e,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const crackBig = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.65), crackBigMat);
  crackBig.position.set(0, 0.17, 0.005);
  root.add(crackBig);

  const crackLight = new THREE.PointLight(0xffb86b, 4.5, 12, 1.8);
  crackLight.position.set(0, 0.4, -1.2);
  root.add(crackLight);

  // ---- sconces along the hallway -------------------------------------------
  const sconces = [];
  for (const [sx, sz] of [[-5.6, 4.6], [5.6, 4.6], [-5.6, 9.6], [5.6, 9.6]]) {
    const g = new THREE.Group();
    g.position.set(sx, 2.2, sz);
    root.add(g);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24, 0.16), darkBrass);
    bracket.position.set(sx > 0 ? -0.14 : 0.14, -0.05, 0);
    g.add(bracket);
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb566 });
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 6), flameMat);
    flame.position.set(sx > 0 ? -0.2 : 0.2, 0.12, 0);
    flame.rotation.z = Math.PI; // point up
    g.add(flame);
    const light = new THREE.PointLight(0xffb566, 2.8, 6.0, 1.8);
    light.position.set(sx > 0 ? -0.55 : 0.55, 0, 0.4);
    g.add(light);
    sconces.push({ light, flame });
  }

  // ---- the work end (what the player is leaving behind) --------------------
  const workGlowMat = new THREE.MeshBasicMaterial({
    color: 0x3d5f9e,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const workStrip = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.07), workGlowMat);
  workStrip.position.set(0.55, 0.05, 14.72);
  root.add(workStrip);

  const monitorMat = new THREE.MeshBasicMaterial({
    color: 0x4a6fb0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const monitor = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.56), monitorMat);
  monitor.position.set(0.55, 1.42, 14.62);
  root.add(monitor);

  const desk = box(1.5, 0.07, 0.7, new THREE.MeshStandardMaterial({ color: 0x14171d, roughness: 0.7 }), 0.55, 0.88, 14.45);
  root.add(desk);
  const deskLeg = new THREE.MeshStandardMaterial({ color: 0x10131a, roughness: 0.8 });
  root.add(box(0.09, 0.88, 0.09, deskLeg, 0.05, 0.44, 14.2));
  root.add(box(0.09, 0.88, 0.09, deskLeg, 1.05, 0.44, 14.2));
  root.add(box(0.09, 0.88, 0.09, deskLeg, 0.05, 0.44, 14.7));
  root.add(box(0.09, 0.88, 0.09, deskLeg, 1.05, 0.44, 14.7));
  const screenFrame = box(0.98, 0.62, 0.05, new THREE.MeshStandardMaterial({ color: 0x0c0f14, roughness: 0.6 }), 0.55, 1.42, 14.66);
  root.add(screenFrame);

  const workLight = new THREE.PointLight(0x4a6fb0, 2.2, 9, 2);
  workLight.position.set(0.55, 1.7, 13.9);
  root.add(workLight);

  // ---- per-frame state ------------------------------------------------------
  const state = {
    open: 0,
    lockP: [0, 0, 0],
    lockFlash: [0, 0, 0],
    keyPulse: 0,
    keyBase: 0,
    crack: 0,
    breath: 0.5,
  };

  const easeToward = (cur, target, dt, rate) => cur + (target - cur) * (1 - Math.exp(-dt * rate));

  function update(t, dt, vis = {}) {
    state.open = easeToward(state.open, vis.doorOpen ?? 0, dt, 1.6);
    door.rotation.y = state.open * 1.92;
    doorSeal.visible = state.open < 0.02;

    // locks
    for (let i = 0; i < 3; i++) {
      const target = vis.locks?.[i] ?? 0;
      state.lockP[i] = easeToward(state.lockP[i], target, dt, 2.4);
      locks[i].keyway.rotation.z = -state.lockP[i] * Math.PI;
      if (vis.lockFlash?.[i]) state.lockFlash[i] = 1;
      state.lockFlash[i] *= Math.exp(-dt * 3.2);
      const active = vis.lockActive === i;
      locks[i].glowMat.opacity =
        state.lockFlash[i] * 0.9 +
        (active ? 0.18 + 0.14 * Math.sin(t * 4.4) : state.lockP[i] * 0.14);
      locks[i].plate.material = brass; // stable ref
    }

    // keyhole: subtle rhythm without blinding over-glow
    state.keyPulse = easeToward(state.keyPulse, vis.keyPulse ?? 0, dt, 9);
    state.keyBase = easeToward(state.keyBase, vis.keyBase ?? 0, dt, 2);
    keyGlowMat.opacity = Math.min(0.5, state.keyPulse * 0.45 + state.keyBase * 0.15);
    keyLight.intensity = state.keyBase * 0.25 + state.keyPulse * 0.5;

    // gentle light under the portal
    state.crack = easeToward(state.crack, vis.crack ?? 0, dt, 1.8);
    crackGlowMat.opacity = 0.04 + 0.15 * state.crack;
    crackBigMat.opacity = 0.02 + 0.08 * state.crack;
    crackLight.intensity = state.crack * 0.8;

    // the door breathes gently
    state.breath = easeToward(state.breath, vis.breath ?? 0.5, dt, 3.5);
    for (let i = 0; i < PLANKS; i++) {
      const s = 1 + 0.003 * state.breath * (1 + 0.15 * Math.sin(t * 0.9 + i * 1.7));
      planks[i].scale.y = s;
    }

    // sconce lanterns — smooth gentle breathing, NO harsh flickering
    for (let i = 0; i < sconces.length; i++) {
      const f = 0.94 + 0.06 * Math.sin(t * 1.6 + i * 1.4);
      sconces[i].light.intensity = 1.6 * f;
      sconces[i].flame.scale.y = f;
    }

    // the workday memory behind you — gentle twilight
    workLight.intensity = 2.0 + 0.2 * Math.sin(t * 1.2);
    monitorMat.opacity = 0.16 + 0.04 * Math.sin(t * 0.9);
  }

  return {
    root,
    door,
    locks,
    keyhole: { glowMat: keyGlowMat, light: keyLight, escutcheon },
    crack: { glowMat: crackGlowMat, bigMat: crackBigMat, light: crackLight },
    sconces,
    workLight,
    monitorMat,
    update,
    state,
  };
}
