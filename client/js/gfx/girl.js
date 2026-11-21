// Stylized low-poly girl character waiting inside the sanctuary room.
import * as THREE from 'three';
import { addBlackOutline, addEdgeOutline } from './outline.js';

export function buildGirl(scene) {
  const root = new THREE.Group();
  root.position.set(-0.35, 0, -4.8); // Inside the sanctuary room, facing the door
  root.rotation.y = 0.25;
  scene.add(root);

  // Materials
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xebc1a7,
    roughness: 0.7,
    metalness: 0.0,
  });
  const dressMat = new THREE.MeshStandardMaterial({
    color: 0xd99b82, // Soft dusty rose / peach terracotta
    roughness: 0.8,
    metalness: 0.0,
  });
  const dressTrimMat = new THREE.MeshStandardMaterial({
    color: 0xf5f0ea,
    roughness: 0.7,
  });
  const hairMat = new THREE.MeshStandardMaterial({
    color: 0x422a1d,
    roughness: 0.85,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xc98c36,
    metalness: 0.7,
    roughness: 0.35,
  });

  // Skirt (flowing cone) with black border
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.38, 0.95, 12, 1, true), dressMat);
  skirt.position.y = 0.52;
  root.add(skirt);
  addBlackOutline(skirt, 1.05);

  // Skirt hem trim
  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.018, 8, 16), dressTrimMat);
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.06;
  root.add(hem);
  addBlackOutline(hem, 1.06);

  // Torso / Bodice
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0.98;
  root.add(torsoGroup);

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, 0.42, 10), dressMat);
  torso.position.y = 0.2;
  torsoGroup.add(torso);
  addBlackOutline(torso, 1.06);

  // Sash / Belt
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.05, 12), goldMat);
  belt.position.y = 0.02;
  torsoGroup.add(belt);
  addEdgeOutline(belt);

  // Neck & Head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), skinMat);
  neck.position.y = 0.44;
  torsoGroup.add(neck);

  const headGroup = new THREE.Group();
  headGroup.position.y = 0.56;
  torsoGroup.add(headGroup);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), skinMat);
  head.scale.set(0.95, 1.05, 0.95);
  headGroup.add(head);
  addBlackOutline(head, 1.06);

  // Stylized anime eyes with black outlines
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x22150d });
  const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.01, 0.01), eyeMat);
  eyeL.position.set(-0.045, 0.015, 0.134);
  eyeL.rotation.z = -0.06;
  headGroup.add(eyeL);

  const eyeR = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.01, 0.01), eyeMat);
  eyeR.position.set(0.045, 0.015, 0.134);
  eyeR.rotation.z = 0.06;
  headGroup.add(eyeR);

  // Soft peach blush
  const blushMat = new THREE.MeshBasicMaterial({ color: 0xdf8c80, transparent: true, opacity: 0.55 });
  const blushL = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), blushMat);
  blushL.position.set(-0.065, -0.018, 0.13);
  headGroup.add(blushL);
  const blushR = new THREE.Mesh(new THREE.CircleGeometry(0.022, 10), blushMat);
  blushR.position.set(0.065, -0.018, 0.13);
  headGroup.add(blushR);

  // Hair (soft stylized bob & bun) with black borders
  const hairBack = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), hairMat);
  hairBack.position.set(0, 0.02, -0.03);
  headGroup.add(hairBack);
  addBlackOutline(hairBack, 1.06);

  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), hairMat);
  bun.position.set(0, 0.08, -0.15);
  headGroup.add(bun);
  addBlackOutline(bun, 1.07);

  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 6, 12), dressMat);
  ribbon.position.set(0, 0.08, -0.12);
  headGroup.add(ribbon);

  // Left & Right Arms gently held forward holding a warm celestial lantern
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.38, 8), skinMat);
  armL.position.set(-0.21, 0.15, 0.12);
  armL.rotation.set(0.65, 0.15, -0.25);
  torsoGroup.add(armL);
  addBlackOutline(armL, 1.08);

  const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.38, 8), skinMat);
  armR.position.set(0.21, 0.15, 0.12);
  armR.rotation.set(0.65, -0.15, 0.25);
  torsoGroup.add(armR);
  addBlackOutline(armR, 1.08);

  // Handheld celestial fairy lantern
  const lantern = new THREE.Group();
  lantern.position.set(0, 0.05, 0.28);
  torsoGroup.add(lantern);

  const lanternBody = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.065, 0),
    new THREE.MeshStandardMaterial({
      color: 0xdf9a34,
      roughness: 0.35,
      metalness: 0.6,
    })
  );
  lantern.add(lanternBody);
  addEdgeOutline(lanternBody);

  const lanternLight = new THREE.PointLight(0xffcaa0, 0.4, 2.8, 2);
  lantern.add(lanternLight);

  function update(t, dt) {
    // Gentle breathing idle motion
    const breath = Math.sin(t * 1.5);
    torsoGroup.position.y = 0.98 + breath * 0.015;
    headGroup.rotation.x = Math.sin(t * 0.8) * 0.03;
    headGroup.rotation.y = Math.sin(t * 0.5) * 0.05;
    lantern.position.y = 0.05 + breath * 0.012;
    lanternLight.intensity = 0.4 + Math.sin(t * 3.2) * 0.08;
  }

  return { root, update };
}
