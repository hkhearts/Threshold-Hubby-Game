// First-person hands for the main character (the boy)
// Styled with cel-shaded black borders, idle breathing, walking bob,
// and interaction gestures.

import * as THREE from 'three';

function createOutlineMesh(geometry, scaleFactor = 1.06, color = 0x140e08) {
  const outlineMat = new THREE.MeshBasicMaterial({
    color,
    side: THREE.BackSide,
    depthTest: true,
  });
  const outline = new THREE.Mesh(geometry, outlineMat);
  outline.scale.setScalar(scaleFactor);
  return outline;
}

export function buildHands(camera) {
  const handsRoot = new THREE.Group();
  camera.add(handsRoot);
  handsRoot.renderOrder = 999;

  // Materials
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xe8b896,
    roughness: 0.65,
    metalness: 0.0,
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x362c26, // Warm charcoal / espresso jacket sleeve
    roughness: 0.8,
    metalness: 0.0,
  });
  const cuffMat = new THREE.MeshStandardMaterial({
    color: 0xd8caa8, // Rolled-up cream shirt cuff
    roughness: 0.7,
  });

  // Base positions in camera space (calibrated for natural first-person view)
  const leftBase = new THREE.Vector3(-0.19, -0.125, -0.40);
  const rightBase = new THREE.Vector3(0.19, -0.125, -0.40);

  // ---- LEFT ARM ----
  const leftArm = new THREE.Group();
  leftArm.position.copy(leftBase);
  handsRoot.add(leftArm);

  // Sleeve
  const leftSleeveGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.22, 10);
  const leftSleeve = new THREE.Mesh(leftSleeveGeo, sleeveMat);
  leftSleeve.rotation.set(1.25, 0.18, -0.32);
  leftSleeve.position.set(0, -0.06, 0.06);
  leftSleeve.add(createOutlineMesh(leftSleeveGeo, 1.08));
  leftArm.add(leftSleeve);

  // Cuff
  const leftCuffGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.04, 10);
  const leftCuff = new THREE.Mesh(leftCuffGeo, cuffMat);
  leftCuff.rotation.set(1.25, 0.18, -0.32);
  leftCuff.position.set(0.025, -0.005, -0.015);
  leftCuff.add(createOutlineMesh(leftCuffGeo, 1.08));
  leftArm.add(leftCuff);

  // Forearm & Hand
  const leftHandGeo = new THREE.BoxGeometry(0.058, 0.032, 0.1);
  const leftHand = new THREE.Mesh(leftHandGeo, skinMat);
  leftHand.position.set(0.04, 0.02, -0.085);
  leftHand.rotation.set(0.2, 0.2, -0.3);
  leftHand.add(createOutlineMesh(leftHandGeo, 1.1));
  leftArm.add(leftHand);

  // Fingers
  const leftFingersGeo = new THREE.BoxGeometry(0.052, 0.024, 0.06);
  const leftFingers = new THREE.Mesh(leftFingersGeo, skinMat);
  leftFingers.position.set(0.012, -0.006, -0.07);
  leftFingers.rotation.x = -0.22;
  leftFingers.add(createOutlineMesh(leftFingersGeo, 1.12));
  leftHand.add(leftFingers);

  // Thumb
  const leftThumbGeo = new THREE.BoxGeometry(0.024, 0.02, 0.048);
  const leftThumb = new THREE.Mesh(leftThumbGeo, skinMat);
  leftThumb.position.set(-0.028, 0.006, -0.015);
  leftThumb.rotation.set(-0.15, 0.45, 0.15);
  leftThumb.add(createOutlineMesh(leftThumbGeo, 1.14));
  leftHand.add(leftThumb);

  // ---- RIGHT ARM ----
  const rightArm = new THREE.Group();
  rightArm.position.copy(rightBase);
  handsRoot.add(rightArm);

  // Sleeve
  const rightSleeveGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.22, 10);
  const rightSleeve = new THREE.Mesh(rightSleeveGeo, sleeveMat);
  rightSleeve.rotation.set(1.25, -0.18, 0.32);
  rightSleeve.position.set(0, -0.06, 0.06);
  rightSleeve.add(createOutlineMesh(rightSleeveGeo, 1.08));
  rightArm.add(rightSleeve);

  // Cuff
  const rightCuffGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.04, 10);
  const rightCuff = new THREE.Mesh(rightCuffGeo, cuffMat);
  rightCuff.rotation.set(1.25, -0.18, 0.32);
  rightCuff.position.set(-0.025, -0.005, -0.015);
  rightCuff.add(createOutlineMesh(rightCuffGeo, 1.08));
  rightArm.add(rightCuff);

  // Forearm & Hand
  const rightHandGeo = new THREE.BoxGeometry(0.058, 0.032, 0.1);
  const rightHand = new THREE.Mesh(rightHandGeo, skinMat);
  rightHand.position.set(-0.04, 0.02, -0.085);
  rightHand.rotation.set(0.2, -0.2, 0.3);
  rightHand.add(createOutlineMesh(rightHandGeo, 1.1));
  rightArm.add(rightHand);

  // Fingers
  const rightFingersGeo = new THREE.BoxGeometry(0.052, 0.024, 0.06);
  const rightFingers = new THREE.Mesh(rightFingersGeo, skinMat);
  rightFingers.position.set(-0.012, -0.006, -0.07);
  rightFingers.rotation.x = -0.22;
  rightFingers.add(createOutlineMesh(rightFingersGeo, 1.12));
  rightHand.add(rightFingers);

  // Thumb
  const rightThumbGeo = new THREE.BoxGeometry(0.024, 0.02, 0.048);
  const rightThumb = new THREE.Mesh(rightThumbGeo, skinMat);
  rightThumb.position.set(0.028, 0.006, -0.015);
  rightThumb.rotation.set(-0.15, -0.45, -0.15);
  rightThumb.add(createOutlineMesh(rightThumbGeo, 1.14));
  rightHand.add(rightThumb);

  // State variables for smooth animation
  let walkTimer = 0;
  let reachP = 0; // 0 = idle, 1 = reaching out
  let strikeP = 0; // 0 = idle, 1 = striking down

  function setVisible(vis) {
    handsRoot.visible = vis;
  }

  function triggerReach() {
    reachP = 1.0;
  }

  function triggerStrike() {
    strikeP = 1.0;
  }

  function update(t, dt, options = {}) {
    if (!handsRoot.visible) return;

    const moving = !!options.moving;
    const breathLevel = options.breath ?? 0.5;

    // Decay action triggers
    if (reachP > 0) reachP = Math.max(0, reachP - dt * 2.8);
    if (strikeP > 0) strikeP = Math.max(0, strikeP - dt * 3.5);

    // Natural idle breathing sway
    const idleY = Math.sin(t * 1.8) * 0.006 + (breathLevel - 0.5) * 0.012;
    const idleX = Math.cos(t * 1.2) * 0.003;

    // Walk bob
    let bobY = 0;
    let bobX = 0;
    if (moving) {
      walkTimer += dt * 8.5;
      bobY = Math.sin(walkTimer) * 0.016;
      bobX = Math.cos(walkTimer * 0.5) * 0.012;
    } else {
      walkTimer = 0;
    }

    // Reach gesture (right hand pushes forward and rotates open)
    const reachZ = -reachP * 0.12;
    const reachY = reachP * 0.04;
    const reachRotX = -reachP * 0.35;

    // Strike gesture (both hands raise then drive down)
    const strikeY = Math.sin(strikeP * Math.PI) * 0.1 - (strikeP > 0.5 ? 0.06 : 0);

    // Update left arm
    leftArm.position.set(
      leftBase.x + idleX + bobX,
      leftBase.y + idleY + bobY + strikeY * 0.7,
      leftBase.z
    );
    leftArm.rotation.x = Math.sin(t * 1.8) * 0.04 + (moving ? Math.sin(walkTimer) * 0.08 : 0);

    // Update right arm
    rightArm.position.set(
      rightBase.x - idleX - bobX,
      rightBase.y + idleY - bobY + reachY + strikeY,
      rightBase.z + reachZ
    );
    rightArm.rotation.x =
      Math.sin(t * 1.8) * 0.04 - (moving ? Math.sin(walkTimer) * 0.08 : 0) + reachRotX;
  }

  return {
    root: handsRoot,
    leftArm,
    rightArm,
    setVisible,
    triggerReach,
    triggerStrike,
    update,
  };
}
