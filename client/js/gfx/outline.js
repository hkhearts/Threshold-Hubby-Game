// Reusable black border / ink outline helper for the cel artstyle.
import * as THREE from 'three';

const OUTLINE_MAT = new THREE.MeshBasicMaterial({
  color: 0x18120c, // Deep ink charcoal / black
  side: THREE.BackSide,
});

export function addBlackOutline(mesh, scale = 1.05, color = 0x18120c) {
  if (!mesh || !mesh.geometry) return null;
  const mat = color === 0x18120c ? OUTLINE_MAT : new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const outline = new THREE.Mesh(mesh.geometry, mat);
  outline.scale.setScalar(scale);
  mesh.add(outline);
  return outline;
}

export function addEdgeOutline(mesh, color = 0x18120c, threshold = 28) {
  if (!mesh || !mesh.geometry) return null;
  const edges = new THREE.EdgesGeometry(mesh.geometry, threshold);
  const lineMat = new THREE.LineBasicMaterial({
    color,
    linewidth: 2,
    polygonOffset: true,
    polygonOffsetFactor: -2.0,
    polygonOffsetUnits: -4.0,
    depthTest: true,
  });
  const line = new THREE.LineSegments(edges, lineMat);
  line.renderOrder = 10;
  mesh.add(line);
  return line;
}
