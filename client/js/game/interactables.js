// Dreamy Love Story Interactables placed in the courtyard outside the portal.
import * as THREE from 'three';
import { addBlackOutline, addEdgeOutline } from '../gfx/outline.js';

export const LOVE_STORIES = [
  {
    id: 'fountain',
    title: 'Memory I — The Rain & The Umbrella',
    pos: [-3.8, 0, 6.2],
    prompt: 'Examine Wishing Basin',
    text: 'You were standing beneath the bookstore awning, shivering from the autumn rain. I had an umbrella, but honestly, I only wanted an excuse to stand beside you. That afternoon the whole city was grey, but your laugh held the warmth of an entire summer. I knew right then that I would walk through any storm to bring you home.',
    unlocked: false,
  },
  {
    id: 'tree',
    title: 'Memory II — The Midnight Drive',
    pos: [3.8, 0, 6.2],
    prompt: 'Listen to Ribbon Tree',
    text: 'Windows rolled down on an empty highway at 2 AM, singing lyrics we kept getting wrong at the top of our lungs. Neither of us cared where the road was headed, as long as the song didn’t end and your hand stayed tucked inside mine.',
    unlocked: false,
  },
  {
    id: 'letter',
    title: 'Memory III — The Letter on the Pillow',
    pos: [-2.6, 0, 2.8],
    prompt: 'Read Folded Note',
    text: '“I know the workday was heavy and the noise was endless, my love. But remember: on this side of the threshold, deadlines have no power. The house is still, the tea is warm, and you were already cherished before you even took off your coat.”',
    unlocked: false,
  },
  {
    id: 'compass',
    title: 'Memory IV — My True North',
    pos: [2.6, 0, 2.8],
    prompt: 'Peer into Starlight Compass',
    text: 'In a world that never stops spinning, with thousands of screens and relentless demands, you are the only place my heart has ever known as still water. Every door I open is just a search for your eyes.',
    unlocked: false,
  },
];

export function buildInteractables(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xc88e36,
    metalness: 0.75,
    roughness: 0.3,
  });
  const marbleMat = new THREE.MeshStandardMaterial({
    color: 0xf3ebe1,
    roughness: 0.75,
    metalness: 0.02,
  });
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xdf9a48,
    emissive: 0x5a3412,
    emissiveIntensity: 0.06, // Solid saturated crystal, no blinding bloom
    roughness: 0.35,
    metalness: 0.15,
  });

  const objects = [];

  for (const story of LOVE_STORIES) {
    const itemRoot = new THREE.Group();
    itemRoot.position.set(...story.pos);
    group.add(itemRoot);

    // Marble Pedestal with black edge outlines
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 0.85, 16), marbleMat);
    base.position.y = 0.425;
    base.receiveShadow = true;
    itemRoot.add(base);
    addEdgeOutline(base);

    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.025, 8, 20), goldMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.85;
    itemRoot.add(rim);
    addBlackOutline(rim);

    // Floating story emblem with ink outline
    const emblem = new THREE.Mesh(
      story.id === 'fountain'
        ? new THREE.TorusGeometry(0.18, 0.045, 10, 24)
        : story.id === 'tree'
          ? new THREE.OctahedronGeometry(0.2, 0)
          : story.id === 'letter'
            ? new THREE.BoxGeometry(0.26, 0.035, 0.35)
            : new THREE.IcosahedronGeometry(0.18, 0),
      crystalMat
    );
    emblem.position.y = 1.15;
    itemRoot.add(emblem);
    addEdgeOutline(emblem);

    // Soft accent light (non-blinding)
    const light = new THREE.PointLight(0xffcaa0, 0.35, 2.5, 2);
    light.position.y = 1.25;
    itemRoot.add(light);

    objects.push({ story, itemRoot, emblem, light });
  }

  function update(t, dt) {
    for (const obj of objects) {
      obj.emblem.rotation.y += dt * 0.85;
      obj.emblem.position.y = 1.15 + Math.sin(t * 2.2 + obj.story.pos[0]) * 0.06;
      obj.light.intensity = 0.35 + Math.sin(t * 3.0 + obj.story.pos[2]) * 0.1;
    }
  }

  return { group, objects, update };
}
