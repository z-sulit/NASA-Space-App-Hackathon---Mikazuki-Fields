/**
 * One low-poly model per crop, each with a feature you can spot from the field camera:
 * corn's ear and tassel, paddy rice standing in water, sorghum's red seed head, cowpea's long pods.
 * Parts are vertex-coloured and merged, so each crop is one geometry for one instanced mesh.
 */
import { BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, PlaneGeometry, Shape, ShapeGeometry, SphereGeometry } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CropId } from "../types";

/** Paint a geometry one solid colour (vertex colours), so parts can be merged into one plant. */
function paint(g: BufferGeometry, hex: string) {
  const c = new Color(hex);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new Float32BufferAttribute(arr, 3));
  g.deleteAttribute("uv");
  return g;
}
const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const RY = (a: number) => new Matrix4().makeRotationY(a);
const RX = (a: number) => new Matrix4().makeRotationX(a);
const RZ = (a: number) => new Matrix4().makeRotationZ(a);
/** Matrices applied right to left, like reading a transform chain from the part outward. */
const chain = (...ms: Matrix4[]) => ms.reduce((acc, m) => acc.multiply(m), new Matrix4());
const part = (g: BufferGeometry, hex: string, ...ms: Matrix4[]) => paint(g.applyMatrix4(chain(...ms)), hex);

/** A strap leaf that arches outward and down from its base (the base sits at the origin). */
function strapLeaf(w: number, len: number, droop: number) {
  const leaf = new PlaneGeometry(w, len, 1, 4);
  const pos = leaf.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) + len / 2) / len; // 0 at the base, 1 at the tip
    pos.setY(i, t * len);
    pos.setZ(i, t * t * droop);
    pos.setX(i, pos.getX(i) * (1 - t * 0.7)); // taper to the tip
  }
  leaf.computeVertexNormals();
  return leaf;
}

/** A heart-shaped leaf, pointing along +Z, lying flat. */
function heartLeaf(size: number) {
  const s = new Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-0.5, 0.15, -0.55, 0.75, -0.25, 0.85);
  s.bezierCurveTo(-0.1, 0.9, 0, 0.8, 0, 0.7);
  s.bezierCurveTo(0, 0.8, 0.1, 0.9, 0.25, 0.85);
  s.bezierCurveTo(0.55, 0.75, 0.5, 0.15, 0, 0);
  const g = new ShapeGeometry(s, 4);
  g.scale(size, size, size);
  g.rotateX(Math.PI / 2);
  g.rotateY(Math.PI);
  return g;
}

const oval = (rx: number, ry: number, rz: number) => new SphereGeometry(1, 7, 5).scale(rx, ry, rz);

function corn() {
  const p: BufferGeometry[] = [part(new CylinderGeometry(0.028, 0.04, 1.0, 6), "#6a9a2e", T(0, 0.5, 0))];
  for (let k = 0; k < 6; k++) p.push(part(strapLeaf(0.1, 0.55, 0.32), k % 2 ? "#5c8f2a" : "#4a7a22", T(0, 0.22 + k * 0.12, 0), RY(k * 2.4), RX(-0.55)));
  // The ear: a green husk with the yellow cob showing at its tip, on the side of the stalk.
  p.push(part(oval(0.055, 0.15, 0.055), "#8fb04c", T(0.07, 0.55, 0), RZ(-0.35)));
  p.push(part(new ConeGeometry(0.04, 0.09, 6), "#f2c94c", T(0.12, 0.68, 0), RZ(-0.35)));
  // The tassel: golden spikes fanning out of the top.
  for (let k = 0; k < 5; k++) p.push(part(new ConeGeometry(0.012, 0.2, 4), "#d6a640", T(0, 1.05, 0), RY(k * 1.26), RZ(k ? 0.6 : 0), T(0, 0.1, 0)));
  return p;
}

function riceClump(blades: number, green: string, grain: string, height: number, droop: number) {
  const p: BufferGeometry[] = [];
  for (let k = 0; k < blades; k++) p.push(part(strapLeaf(0.035, height, 0.12), k % 2 ? green : "#6f9a3a", RY((k / blades) * Math.PI * 2), RX(-0.18 - (k % 3) * 0.08)));
  // Panicles: a row of grains arching over from the top of three tillers.
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < 9; j++) {
      const t = j / 8;
      p.push(part(oval(0.014, 0.024, 0.014), grain, RY(k * 2.1 + 0.4), T(0, height * 0.92 + Math.sin(t * Math.PI * 0.8) * 0.06 - t * t * droop, 0.04 + t * 0.16)));
    }
  }
  return p;
}

function paddyRice() {
  // Standing water around the hill: the one crop grown flooded.
  return [part(new CylinderGeometry(0.27, 0.27, 0.012, 14), "#4f8fae", T(0, 0.006, 0)), ...riceClump(10, "#7cb342", "#e2bd4f", 0.62, 0.14)];
}

function uplandRice() {
  // Dry ground: a small soil hill instead of water, fewer and yellower tillers, grain held higher.
  return [part(new ConeGeometry(0.16, 0.06, 8), "#7a5a3a", T(0, 0.03, 0)), ...riceClump(7, "#a3b84a", "#c9a86a", 0.55, 0.05)];
}

function sorghum() {
  const p: BufferGeometry[] = [part(new CylinderGeometry(0.035, 0.045, 0.95, 6), "#7f9a3a", T(0, 0.475, 0))];
  for (let k = 0; k < 5; k++) p.push(part(strapLeaf(0.13, 0.48, 0.28), k % 2 ? "#6d8f34" : "#5b7f2c", T(0, 0.2 + k * 0.13, 0), RY(k * 2.5), RX(-0.6)));
  // The seed head: a dense rust-red cluster on top, with no ear or tassel.
  p.push(part(oval(0.085, 0.15, 0.085), "#9c4a2a", T(0, 1.07, 0)));
  for (let k = 0; k < 8; k++) p.push(part(oval(0.035, 0.035, 0.035), k % 2 ? "#b5582f" : "#7d3a22", T(0, 1.02 + (k % 4) * 0.04, 0), RY(k * 0.8), T(0.075, 0, 0)));
  return p;
}

/** Three leaflets around a point, the legume leaf. */
function trifoliate(cx: number, cy: number, cz: number, r: number, hex: string, turn: number) {
  return [0, 1, 2].map((k) => part(oval(r, r * 0.25, r * 0.6), hex, T(cx, cy, cz), RY(turn + k * 2.1), T(r * 0.8, 0, 0), RZ(0.25)));
}

function mungbean() {
  const p: BufferGeometry[] = [part(new CylinderGeometry(0.018, 0.026, 0.42, 5), "#4f7a2a", T(0, 0.21, 0))];
  [
    [0, 0.44, 0, 0.09],
    [0.1, 0.32, 0.05, 0.08],
    [-0.09, 0.3, -0.06, 0.08],
    [0.02, 0.22, -0.11, 0.07],
    [-0.03, 0.24, 0.11, 0.07],
  ].forEach(([x, y, z, r], i) => p.push(...trifoliate(x, y, z, r, i % 2 ? "#5aa040" : "#4b8c35", i)));
  // Clusters of slim black pods pointing up out of the top: mungbean's tell.
  for (let k = 0; k < 6; k++) p.push(part(new CylinderGeometry(0.009, 0.012, 0.13, 4), "#2b2a22", T(0, 0.48, 0), RY(k * 1.05), RZ(0.45), T(0, 0.065, 0)));
  return p;
}

function peanut() {
  // Low and wide: rings of small paired leaflets hugging the ground, with yellow flowers.
  const p: BufferGeometry[] = [];
  const rings = [
    [1, 0, 0.17],
    [6, 0.08, 0.14],
    [10, 0.16, 0.1],
    [13, 0.24, 0.05],
  ];
  rings.forEach(([n, r, y], ring) => {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + ring * 0.4;
      for (const side of [-1, 1]) p.push(part(oval(0.05, 0.014, 0.034), (k + ring) % 2 ? "#6fae4a" : "#5a9a3c", RY(a), T(r, y, side * 0.035), RZ(0.15)));
    }
  });
  for (let k = 0; k < 5; k++) p.push(part(oval(0.026, 0.022, 0.026), "#f2c230", RY(k * 1.25 + 0.5), T(0.12, 0.17, 0)));
  return p;
}

function cowpea() {
  const p: BufferGeometry[] = [part(new CylinderGeometry(0.02, 0.028, 0.5, 5), "#4f7a2a", T(0, 0.25, 0))];
  [
    [0, 0.52, 0, 0.12],
    [0.15, 0.4, 0.06, 0.11],
    [-0.15, 0.38, -0.05, 0.11],
  ].forEach(([x, y, z, r], i) => p.push(...trifoliate(x, y, z, r, i % 2 ? "#4f9440" : "#428436", i * 1.3)));
  // Long pale pods hanging below the leaves, and purple flowers: cowpea's tell.
  for (let k = 0; k < 6; k++) p.push(part(new CylinderGeometry(0.009, 0.013, 0.3, 4), "#a8c95e", RY(k * 1.05 + 0.3), T(0.16, 0.42, 0), RZ(0.28 + (k % 2) * 0.14), T(0, -0.15, 0)));
  for (let k = 0; k < 3; k++) p.push(part(oval(0.03, 0.025, 0.03), "#9b6fc4", RY(k * 2.1 + 1), T(0.08, 0.6, 0)));
  return p;
}

function sweetPotato() {
  // Vines running flat across the ground with heart-shaped leaves, and a purple root showing.
  const p: BufferGeometry[] = [part(oval(0.06, 0.04, 0.09), "#a0405a", T(0.03, 0.02, 0), RY(0.6))];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    p.push(part(new CylinderGeometry(0.01, 0.01, 0.3, 4), "#5f7f2e", RY(a), T(0, 0.025, 0.15), RX(Math.PI / 2)));
    p.push(part(heartLeaf(0.21), k % 2 ? "#7a4f8e" : "#5c9a3a", RY(a), T(0, 0.06, 0.2), RX(-0.35)));
    p.push(part(heartLeaf(0.16), k % 2 ? "#5c9a3a" : "#8a5a9e", RY(a + 0.45), T(0, 0.1, 0.08), RX(-0.55)));
  }
  return p;
}

const BUILD: Record<CropId, () => BufferGeometry[]> = {
  corn,
  paddy_rice: paddyRice,
  upland_rice: uplandRice,
  sorghum,
  mungbean,
  peanut,
  cowpea,
  sweet_potato: sweetPotato,
};

/** The crop's model as one merged geometry, base at y = 0. */
export function cropModel(id: CropId): BufferGeometry {
  const parts = BUILD[id]();
  // Some parts are indexed (spheres, planes) and some are not (shapes): merge needs them all one way.
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  return mergeGeometries(flat)!;
}
