// Cutscene definitions.
//
// The intro: a slow walk down the dark hallway away from the cold workday
// glow toward the door, narrated in six lines, with the light under the door
// growing as we approach. The cross: the door swings open, the camera pushes
// through into the warm room and settles on the fireplace.

export function introWalk(director) {
  director.play(
    [
      { t: 0, p: [1.15, 1.74, 9.6], l: [0, 1.62, 0], fov: 40 },
      { t: 8, p: [0.72, 1.7, 7.2], l: [0, 1.6, 0], fov: 39 },
      { t: 16, p: [0.36, 1.66, 4.7], l: [0, 1.58, 0], fov: 38 },
      { t: 25, p: [0.12, 1.62, 3.15], l: [0, 1.55, 0], fov: 38 },
      { t: 33, p: [0.04, 1.6, 2.55], l: [0, 1.53, 0], fov: 38 },
    ],
    { duration: 33, sway: 0.045 }
  );
}

export const INTRO_EVENTS = [
  [0.4, { letterbox: true }],
  [1.2, { narration: 'Six o\u2019clock. The screen goes dark.' }],
  [6.2, { narration: 'You step away from the relentless rush of the world.' }],
  [11.6, { narration: 'In this dreamy sanctuary, memories of love wait in the starlight.' }],
  [17.2, { narration: 'Beyond the golden portal arch... she is waiting for you.' }],
  [23.2, { narration: 'Explore the courtyard. Walk with WASD and look with mouse.' }],
  [29.2, { narration: 'Uncover her memories and let your breath turn the keys.' }],
];

export const INTRO_DURATION = 33;

export function crossCutscene(director) {
  director.play(
    [
      { t: 0, p: [0.02, 1.56, 2.1], l: [0, 1.5, 0], fov: 38 },
      { t: 1.8, p: [0.0, 1.52, 1.0], l: [0, 1.45, -1.5], fov: 40 },
      { t: 3.8, p: [0.05, 1.5, -0.8], l: [-0.35, 1.4, -4.0], fov: 42 },
      { t: 5.8, p: [-0.05, 1.55, -1.8], l: [-0.35, 1.25, -4.8], fov: 42 },
      { t: 8.0, p: [0.0, 1.55, -2.5], l: [-0.35, 1.15, -4.8], fov: 44 },
    ],
    { duration: 8, sway: 0.02 }
  );
}

export const CROSS_DURATION = 8;
