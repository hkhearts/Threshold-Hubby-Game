// Dreamy Courtyard Mini-Games:
// 1. The Breath Hammer (Bell Striker)
// 2. The Pulse Harmony Lotus Garden
// 3. The Celestial Breeze Vortex

import * as THREE from 'three';
import { addBlackOutline, addEdgeOutline } from '../gfx/outline.js';

export class MiniGameManager {
  constructor(scene, audio, locks, ui) {
    this.scene = scene;
    this.audio = audio;
    this.locks = locks;
    this.ui = ui;

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.activeGame = null;
    this.gameState = 'idle';
    this.gameTimer = 0;

    this._buildBreathHammer();
    this._buildPulseGarden();
    this._buildBreezeTree();
  }

  // 1. ---- THE BREATH HAMMER ----
  _buildBreathHammer() {
    this.hammerGroup = new THREE.Group();
    this.hammerGroup.position.set(-5.0, 0, 4.2);
    this.root.add(this.hammerGroup);

    const goldMat = new THREE.MeshStandardMaterial({ color: 0xdf9e38, metalness: 0.9, roughness: 0.2 });
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xc48c34, metalness: 0.8, roughness: 0.3 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xf3ebe1, roughness: 0.7 });

    // Base anvil
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.45, 1.2), stoneMat);
    base.position.y = 0.225;
    this.hammerGroup.add(base);
    addEdgeOutline(base);

    const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.7), brassMat);
    anvil.position.y = 0.55;
    this.hammerGroup.add(anvil);
    addEdgeOutline(anvil);

    // Tower rails (height 4.2m)
    const railL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 8), brassMat);
    railL.position.set(-0.25, 2.3, 0);
    this.hammerGroup.add(railL);
    addEdgeOutline(railL);

    const railR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 8), brassMat);
    railR.position.set(0.25, 2.3, 0);
    this.hammerGroup.add(railR);
    addEdgeOutline(railR);

    // Celestial Bell at top
    const bell = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.32, 12, 1, true), goldMat);
    bell.position.set(0, 4.35, 0);
    this.hammerGroup.add(bell);
    addBlackOutline(bell);
    this.bellLight = new THREE.PointLight(0xffcaa0, 0.4, 3.5, 2);
    this.bellLight.position.set(0, 4.4, 0.2);
    this.hammerGroup.add(this.bellLight);

    // Striker Puck (rises when struck) - solid & outlined, no blinding emissive
    this.puck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.1, 16),
      new THREE.MeshStandardMaterial({ color: 0xdf9a34, roughness: 0.3, metalness: 0.6 })
    );
    this.puck.position.set(0, 0.75, 0);
    this.hammerGroup.add(this.puck);
    addEdgeOutline(this.puck);
    this.puckTargetY = 0.75;

    // The Golden Hammer (rotates around hinge)
    this.hammerPivot = new THREE.Group();
    this.hammerPivot.position.set(0, 0.75, 0.55);
    this.hammerGroup.add(this.hammerPivot);

    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.1, 8), brassMat);
    handle.position.set(0, 0.5, 0);
    this.hammerPivot.add(handle);
    addEdgeOutline(handle);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.22), goldMat);
    head.position.set(0, 1.05, 0);
    this.hammerPivot.add(head);
    addEdgeOutline(head);

    this.hammerTargetRot = 0;
  }

  // 2. ---- THE PULSE HARMONY LOTUS GARDEN ----
  _buildPulseGarden() {
    this.gardenGroup = new THREE.Group();
    this.gardenGroup.position.set(5.0, 0, 4.2);
    this.root.add(this.gardenGroup);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0xf3ebe1, roughness: 0.7 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.35, 20), stoneMat);
    basin.position.y = 0.175;
    this.gardenGroup.add(basin);
    addEdgeOutline(basin);

    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x7aaec8,
      roughness: 0.3,
      metalness: 0.5,
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.15, 20), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.36;
    this.gardenGroup.add(water);

    // 3 Lotus Flowers with crisp ink outlines
    this.lotuses = [];
    const lotusMat = new THREE.MeshStandardMaterial({
      color: 0xeb9fa8,
      roughness: 0.5,
      metalness: 0.05,
    });

    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI * 2) / 3;
      const lotus = new THREE.Group();
      lotus.position.set(Math.cos(angle) * 0.65, 0.4, Math.sin(angle) * 0.65);
      this.gardenGroup.add(lotus);

      for (let p = 0; p < 6; p++) {
        const petal = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 5), lotusMat);
        petal.position.set(Math.cos((p * Math.PI) / 3) * 0.08, 0.08, Math.sin((p * Math.PI) / 3) * 0.08);
        petal.rotation.z = 0.35;
        lotus.add(petal);
        addBlackOutline(petal, 1.08);
      }
      this.lotuses.push({ group: lotus, bloomed: false });
    }
  }

  // 3. ---- THE BREEZE VORTEX TREE ----
  _buildBreezeTree() {
    this.breezeGroup = new THREE.Group();
    this.breezeGroup.position.set(0, 0, 9.8);
    this.root.add(this.breezeGroup);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0xcbb096, roughness: 0.75 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 2.2, 8), woodMat);
    trunk.position.y = 1.1;
    this.breezeGroup.add(trunk);
    addEdgeOutline(trunk);

    const foliageMat = new THREE.MeshStandardMaterial({
      color: 0xdeb89a,
      roughness: 0.7,
    });
    const foliage = new THREE.Mesh(new THREE.DodecahedronGeometry(1.05, 1), foliageMat);
    foliage.position.y = 2.4;
    this.breezeGroup.add(foliage);
    addEdgeOutline(foliage);
  }

  // ---- INTERACTION TRIGGERS ----
  checkInteractions(playerPos) {
    const hammerDist = playerPos.distanceTo(new THREE.Vector3(-5.0, playerPos.y, 4.2));
    if (hammerDist < 2.2) {
      return {
        type: 'game',
        id: 'hammer',
        prompt: 'Strike Breath Hammer',
        action: () => this.startBreathHammer(),
      };
    }

    const gardenDist = playerPos.distanceTo(new THREE.Vector3(5.0, playerPos.y, 4.2));
    if (gardenDist < 2.2) {
      return {
        type: 'game',
        id: 'pulse',
        prompt: 'Harmonize Pulse Lotus',
        action: () => this.startPulseGarden(),
      };
    }

    const breezeDist = playerPos.distanceTo(new THREE.Vector3(0, playerPos.y, 9.8));
    if (breezeDist < 2.4) {
      return {
        type: 'game',
        id: 'breeze',
        prompt: 'Call Celestial Breeze',
        action: () => this.startBreeze(),
      };
    }

    return null;
  }

  startBreathHammer() {
    this.activeGame = 'hammer';
    this.gameState = 'ready';
    this.gameTimer = 0;
    this.ui.narration('The Breath Hammer: Inhale to raise, hold, then exhale with all your might to strike!', { hold: 5500 });
  }

  startPulseGarden() {
    this.activeGame = 'pulse';
    this.gameState = 'matching';
    this.gameTimer = 0;
    this.ui.narration('Pulse Lotus: Breathe softly. Feel your heartbeat align with the garden.', { hold: 5500 });
  }

  startBreeze() {
    this.activeGame = 'breeze';
    this.gameState = 'calling';
    this.gameTimer = 0;
    this.ui.narration('Celestial Blossom Tree: Take a slow, deep exhale to awaken the spring breeze.', { hold: 5500 });
  }

  handleBreathEvent(type, dur = 0) {
    if (this.activeGame === 'hammer') {
      if (type === 'inhale') {
        this.gameState = 'raising';
        this.hammerTargetRot = -1.2; // raise back
      } else if (type === 'exhale') {
        this.gameState = 'struck';
        this.hammerTargetRot = 0.35; // smash down
        this.audio.doorThud?.();
        this.audio.bell?.();
        this.puckTargetY = 4.3; // puck shoots to top!
        this.ui.narration('CLANG! The celestial bell tolls! Lock I turns on the portal!', { hold: 4500 });
        this.locks.onLongExhale();
        setTimeout(() => {
          this.activeGame = null;
          this.hammerTargetRot = 0;
          this.puckTargetY = 0.75;
        }, 3500);
      }
    } else if (this.activeGame === 'breeze') {
      if (type === 'exhale') {
        this.ui.narration('The golden blossoms swirl through the air! Lock III turns on the portal!', { hold: 4500 });
        this.audio.homeChord?.();
        this.locks.onLongExhale();
        this.activeGame = null;
      }
    }
  }

  handlePulseBeat() {
    if (this.activeGame === 'pulse') {
      const next = this.lotuses.find((l) => !l.bloomed);
      if (next) {
        next.bloomed = true;
        this.audio.lockClick?.(this.lotuses.filter((l) => l.bloomed).length);
        if (this.lotuses.every((l) => l.bloomed)) {
          this.ui.narration('All lotus flowers bloom in perfect harmony! Lock II turns on the portal!', { hold: 4500 });
          this.locks.onLongExhale();
          this.activeGame = null;
        }
      }
    }
  }

  update(t, dt) {
    // Hammer animation
    this.hammerPivot.rotation.x += (this.hammerTargetRot - this.hammerPivot.rotation.x) * (1 - Math.exp(-dt * 12));
    this.puck.position.y += (this.puckTargetY - this.puck.position.y) * (1 - Math.exp(-dt * 8));

    // Lotus animation
    for (const l of this.lotuses) {
      if (l.bloomed) {
        l.group.rotation.y += dt * 0.8;
        l.group.scale.setScalar(1.2 + Math.sin(t * 2.5) * 0.08);
      }
    }
  }
}
