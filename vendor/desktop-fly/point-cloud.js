// Extracted from DenisSergeevitch/desktop-fly windows/renderer/brain.js.
// Commit 32b00011e83c3dc85fa3ea0b3934155b04f1635d. MIT, see LICENSE.
import * as THREE from '../../node_modules/three/build/three.module.js';

export function pointCloud(positions, colors, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const m = new THREE.PointsMaterial({
    size,
    sizeAttenuation: true,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  });
  return new THREE.Points(g, m);
}
