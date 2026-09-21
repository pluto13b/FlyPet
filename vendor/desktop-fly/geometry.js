// flymodel.js — port of FlyModel.swift: procedural 3D fruit-fly body (FlyWire
// has no body data; the connectome drives behavior, the body is modeled) plus
// per-fly behavior. Local frame: +Y forward, +Z up, ground at z=0.
//
// SceneKit -> three.js mapping used throughout:
//   SCNNode          -> THREE.Object3D      (eulerAngles -> rotation, XYZ order
//                                            matches SceneKit's Rx*Ry*Rz)
//   SCNSphere(r)     -> SphereGeometry(r)
//   SCNCapsule(r,h)  -> CapsuleGeometry(r, h - 2r)   (both are Y-axis, centered)
//   SCNCone(t,b,h)   -> CylinderGeometry(t, b, h)
//   SCNShape(path,d) -> ExtrudeGeometry(shape, {depth:d}), re-centered on z
//   node.isHidden    -> !node.visible
//   node.opacity     -> material.opacity (per-node material clones)

// relative rather than bare so the same module resolves in Node (tests)
// and in the renderer without an inline importmap
import * as THREE from '../../node_modules/three/build/three.module.js';
const TUNED_HZ = 60;

const LegDynamics = { ankleAngle: 0.35 };

export const SHADOWS_ENABLED = true;
export const FLY_SCALE = 1.15;
export const EDGE_MARGIN = 50;
// How close the fly's centre may get to the edge of the desktop while walking.
// The body is ~30 px tall at FLY_SCALE, so the macOS value of 20 let the head
// slide under the screen edge; this keeps the whole body on screen.
export const EDGE_CLAMP = 45;
export const SCARE_RADIUS = 110;     // legacy behavior (non-connectome flies) only
export const NERVOUS_RADIUS = 240;   // legacy behavior only

// Heading random-walk amplitude, rad/sqrt(s). The variance of a random walk
// grows with dt, not dt^2, so the old `rnd(-1, 1) * 1.6 * dt` form made the
// fly measurably twitchier on a 60 Hz display than on a 120 Hz one. Dividing
// by sqrt(TUNED_HZ) reproduces the old 60 Hz spread exactly.
export const WANDER_JITTER = 1.6 / Math.sqrt(TUNED_HZ);
// Same recalibration of the old ledge-walking `0.2 * dt`.
export const LEDGE_JITTER = 0.2 / Math.sqrt(TUNED_HZ);

// MARK: - Measured walking kinematics
//
// A walking fly does not steer continuously. It goes nearly straight and
// changes heading in discrete body saccades, with slow sub-threshold drift in
// between — Geurten, Jähde, Rosner & Egelhaaf 2014 (Front Behav Neurosci
// 8:365, 10.3389/fnbeh.2014.00365) scored 1140 saccades against 3348 slow
// turns in freely walking Canton-S at 500 fps. So the shape here is right;
// the numbers were not. The code snapped the heading by up to 86 deg in a
// single step.

// Body-saccade amplitude, rad. Measured mean is ~15 deg; this range averages
// to it. Sign is drawn separately (Geurten et al. 2014).
export const SACCADE_MIN = 0.09;   // 5 deg
export const SACCADE_MAX = 0.44;   // 25 deg
// Body-saccade duration, s — measured 40-120 ms, median 90 (Geurten et al.
// 2014). A 15 deg turn spent over it peaks near 170 deg/s, just under the
// 200 deg/s those authors use as the saccade detection threshold.
export const SACCADE_DUR = 0.09;
// Swing (leg-in-air) duration, s. Nearly constant across walking speed — it is
// stance that scales as 1/v — Mendes, Bartos, Akay, Márka & Mann 2013
// (eLife 2:e00231, 10.7554/eLife.00231, Table 2). The gait used a fixed 40%
// swing fraction instead, which stretches the swing at low speed.
export const SWING_DUR = 0.035;

// NSColor(calibratedRed:green:blue:) values are sRGB components.
function srgb(r, g, b) { return new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace); }
function blendBlack(c, f) { return c.clone().multiplyScalar(1 - f); }
function blendWhite(c, f) { return c.clone().lerp(new THREE.Color(1, 1, 1), f); }

export function mat(color, specular = 0.25, shininess = 0.25) {
  return new THREE.MeshPhongMaterial({
    color,
    specular: new THREE.Color(specular, specular, specular),
    shininess: shininess * 100,
  });
}

// 64x128 abdominal banding. NSImage draws bottom-up, canvas top-down, so the
// band rectangles are flipped to keep the dark tip at the same end.
export function abdomenTexture() {
  if (typeof document === 'undefined') return null;   // headless test runs
  const W = 64, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgb(184, 140, 82)';    // 0.72, 0.55, 0.32
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgb(56, 38, 23)';      // 0.22, 0.15, 0.09
  for (const [y, h] of [[0, 26], [38, 10], [60, 10], [82, 9]]) {
    ctx.fillRect(0, H - y - h, W, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Leg {
  constructor(root, knee, ankle, geometry, baseYaw, swingSign, phase, isFront) {
    this.root = root;
    this.knee = knee;
    this.ankle = ankle;
    this.geometry = geometry;
    this.baseYaw = baseYaw;
    this.swingSign = swingSign;
    this.phase = phase;
    this.isFront = isFront;
    this.angle = 0;
    this.lift = 0;
    this.kneeAngle = 0.75;
  }

  apply(feedback = null) {
    if (feedback) {
      this.angle = feedback.hipAngle;
      this.lift = feedback.elevationAngle;
      this.kneeAngle = feedback.kneeAngle;
    }
    // All controllers share the same articulated coordinate system.
    this.root.rotation.set(0, -this.lift, this.baseYaw + this.swingSign * this.angle, 'ZYX');
    this.knee.rotation.set(0, this.kneeAngle, 0);
    this.ankle.rotation.set(0, LegDynamics.ankleAngle, 0);
  }

}

function buildLeg(attach, baseYaw, swingSign, phase, isFront, femur, tibia, tarsus) {
  const legColor = srgb(0.33, 0.24, 0.14);
  const root = new THREE.Object3D();
  root.position.set(attach[0], attach[1], attach[2]);

  const femurNode = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.48, Math.max(0.01, femur - 0.96), 4, 10), mat(legColor));
  femurNode.rotation.set(0, 0, -Math.PI / 2);
  femurNode.position.set(femur / 2, 0, 0);
  root.add(femurNode);

  const knee = new THREE.Object3D();
  knee.position.set(femur, 0, 0);
  knee.rotation.set(0, 0.75, -0.30 * swingSign);
  root.add(knee);

  const tibiaNode = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.38, Math.max(0.01, tibia - 0.76), 4, 10), mat(legColor));
  tibiaNode.rotation.set(0, 0, -Math.PI / 2);
  tibiaNode.position.set(tibia / 2, 0, 0);
  knee.add(tibiaNode);

  const ankle = new THREE.Object3D();
  ankle.position.set(tibia, 0, 0);
  ankle.rotation.set(0, 0.35, -0.15 * swingSign);
  knee.add(ankle);

  const tarsusNode = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.24, Math.max(0.01, tarsus - 0.48), 4, 8),
    mat(blendBlack(legColor, 0.25)));
  tarsusNode.rotation.set(0, 0, -Math.PI / 2);
  tarsusNode.position.set(tarsus / 2, 0, 0);
  ankle.add(tarsusNode);

  const geometry = { attachX: attach[0], attachY: attach[1], attachZ: attach[2],
    baseYaw, side: swingSign, femur, tibia, tarsus };
  const leg = new Leg(root, knee, ankle, geometry, baseYaw, swingSign, phase, isFront);
  leg.apply();
  return leg;
}

function wingMesh() {
  // NSBezierPath(ovalIn: NSRect(x: -2.6, y: -16.5, width: 5.2, height: 16.5))
  const shape = new THREE.Shape();
  shape.absellipse(0, -16.5 + 16.5 / 2, 2.6, 16.5 / 2, 0, 2 * Math.PI, false, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false, curveSegments: 24 });
  geo.translate(0, 0, -0.06);   // SCNShape extrudes symmetrically about z = 0
  const m = new THREE.MeshPhongMaterial({
    color: srgb(0.92, 0.92, 0.92),
    specular: new THREE.Color(0.9, 0.9, 0.9),
    shininess: 90,
    transparent: true,
    opacity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, m);
}

export function buildFlyModel() {
  const root = new THREE.Object3D();
  root.scale.set(FLY_SCALE, FLY_SCALE, FLY_SCALE);

  const bodyBrown = srgb(0.50, 0.38, 0.22);

  const thorax = new THREE.Mesh(new THREE.SphereGeometry(4.6, 28, 20),
                                mat(bodyBrown, 0.35, 0.4));
  thorax.position.set(0, 2.5, 6.2);
  thorax.scale.set(0.95, 1.15, 0.85);
  root.add(thorax);

  const abdMat = new THREE.MeshPhongMaterial({
    color: 0xffffff,
    specular: new THREE.Color(0.3, 0.3, 0.3),
    shininess: 35,
  });
  const abdTex = abdomenTexture();
  if (abdTex) abdMat.map = abdTex;
  else abdMat.color = srgb(0.60, 0.44, 0.24);   // headless: flat body colour
  const abdomen = new THREE.Mesh(new THREE.SphereGeometry(5.0, 28, 20), abdMat);
  abdomen.position.set(0, -6.5, 5.6);
  abdomen.scale.set(0.9, 1.5, 0.75);
  root.add(abdomen);

  const head = new THREE.Mesh(new THREE.SphereGeometry(3.0, 24, 16),
                              mat(blendWhite(bodyBrown, 0.15)));
  head.position.set(0, 9.0, 6.0);
  head.scale.set(1.0, 0.85, 0.9);
  root.add(head);

  const eyeGeo = new THREE.SphereGeometry(2.0, 22, 16);
  const eyeMat = mat(srgb(0.62, 0.10, 0.07), 0.9, 0.9);
  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 2.1, 9.7, 6.4);
    eye.scale.set(0.8, 1.0, 1.15);
    root.add(eye);
    eyes.push(eye);
  }

  const antGeo = new THREE.CapsuleGeometry(0.16, 2.2 - 0.32, 4, 8);
  const antMat = mat(srgb(0.3, 0.22, 0.13));
  for (const side of [-1, 1]) {
    const ant = new THREE.Mesh(antGeo, antMat);
    ant.position.set(side * 0.9, 11.6, 6.3);
    ant.rotation.set(-1.15, 0, side * 0.35);
    root.add(ant);
  }

  const prob = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.22, 2.4, 16),
                              mat(srgb(0.35, 0.26, 0.16)));
  prob.position.set(0, 10.4, 4.6);
  prob.rotation.set(-0.5, 0, 0);
  root.add(prob);

  const legs = [];
  const z = 4.5;
  const specs = [
    [1, [3.1, 5.3, z], 0.95, 0.0, true, 4.2, 4.8, 3.2],
    [-1, [-3.1, 5.3, z], 0.95, 0.5, true, 4.2, 4.8, 3.2],
    [1, [3.7, 2.0, z], -0.10, 0.5, false, 4.8, 5.6, 3.8],
    [-1, [-3.7, 2.0, z], -0.10, 0.0, false, 4.8, 5.6, 3.8],
    [1, [3.3, -1.2, z], -0.95, 0.0, false, 5.8, 7.0, 4.6],
    [-1, [-3.3, -1.2, z], -0.95, 0.5, false, 5.8, 7.0, 4.6],
  ];
  for (const [side, attach, yawOff, phase, isFront, f, t, ta] of specs) {
    const baseYaw = side > 0 ? yawOff : (Math.PI - yawOff);
    const leg = buildLeg(attach, baseYaw, side, phase, isFront, f, t, ta);
    root.add(leg.root);
    legs.push(leg);
  }

  const foldedWings = new THREE.Object3D();
  for (const side of [-1, 1]) {
    const wing = wingMesh();
    wing.position.set(side * 1.6, 0.5, side > 0 ? 10.4 : 10.25);
    wing.rotation.set(0, 0, side * 0.13);
    foldedWings.add(wing);
  }
  root.add(foldedWings);

  function blurWing(side) {
    const m = new THREE.MeshBasicMaterial({
      color: srgb(0.85, 0.85, 0.85),
      transparent: true,
      opacity: 0.30,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const n = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 12), m);
    n.position.set(side * 8.4, -2.8, 10.65);
    n.scale.set(5.5, 2.4, 0.3);
    n.rotation.set(0, 0, side * -0.45);
    n.visible = false;
    return n;
  }
  const bl = blurWing(-1), br = blurWing(1);
  root.add(bl);
  root.add(br);

  if (SHADOWS_ENABLED) {
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    bl.castShadow = false;
    br.castShadow = false;
  }

  return { root, legs, foldedWings, blurWingL: bl, blurWingR: br, abdomen, head, thorax, eyes, proboscis:prob, wingFlightSpread: 1.1 };
}


