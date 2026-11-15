/**
 * Step 05 in WebGL: six soil plots, one per season, planted one after another by the hovering suit.
 * One instanced mesh per crop (models in ./cropModels) keeps ~200 plants cheap.
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  BufferAttribute,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  AdditiveBlending,
  DoubleSide,
} from "three";
import type { CropId, Family } from "../types";
import { cropModel } from "./cropModels";
import { CROPS } from "../data/crops";
import { fitPolygonToField, pointInPolygon, type Point, type XYPoint } from "../utils/geo";

export interface PlotSpec {
  crop: CropId;
  family: Family;
  label: string;
  wilt: boolean;
}
export interface PlantHandle {
  /**
   * Replant the field (season by season). onSeason(i) fires as each plot starts; i = 6 when done.
   * quick: all six beds regrow at once (switching routes on the field), with no drone pass.
   */
  plant(plots: PlotSpec[], onSeason: (i: number) => void, quick?: boolean): void;
  /** Back to the default camera angle and zoom. */
  resetView(): void;
  /** Update wilting (dry spell) without replanting. */
  setWilt(wilt: boolean[]): void;
  /** El Niño look: harsh orange sun, dry cracked soil, blowing dust (eases in and out). */
  setDrought(on: boolean): void;
  /** Spotlight one bed (0–5): it rises and stays bright, the others dim. null = all beds. */
  setFocus(index: number | null): void;
  dispose(): void;
}

const PLOT_W = 1.5;
const PLOT_D = 4.2;
const GAP = 0.22;
const COLS = 3;
const ROWS = 8;
const STEP = 0.3; // seconds between seasons
const GROW = 0.35; // seconds for one plant to grow in
const FAMILY_TINT: Record<Family, string> = { Poaceae: "#a87c0e", Fabaceae: "#4d8b3a", Convolvulaceae: "#8e5ba8" };

/** Bed label. "S1 · Jun–Nov '27\nPeanut" draws as two lines: the season and dates, then the crop. */
function labelSprite(text: string) {
  const [top, crop] = text.includes("\n") ? text.split("\n") : [text, ""];
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = crop ? 168 : 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(29,36,10,0.78)";
  g.beginPath();
  g.roundRect(4, 8, 504, c.height - 16, 36);
  g.fill();
  g.textAlign = "center";
  g.textBaseline = "middle";
  if (crop) {
    g.fillStyle = "rgba(246,239,235,0.78)";
    g.font = '500 34px "Inter Tight", Arial, sans-serif';
    g.fillText(top.toUpperCase(), 256, 56);
    g.fillStyle = "#f6efeb";
    g.font = '600 42px "Inter Tight", Arial, sans-serif';
    g.fillText(crop.toUpperCase(), 256, 112);
  } else {
    g.fillStyle = "#f6efeb";
    g.font = '500 34px "Inter Tight", Arial, sans-serif';
    g.fillText(top.toUpperCase(), 256, 49);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.55, (1.55 * c.height) / 512, 1);
  return s;
}

/** Dry-season cracks: a deterministic web of dark, branching lines on a transparent canvas. */
function crackTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  let seed = 11;
  const r = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  ctx.strokeStyle = "rgba(38, 24, 12, 0.9)";
  ctx.lineCap = "round";
  const walk = (x: number, y: number, a: number, len: number, w: number) => {
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < len; i++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * 9;
      y += Math.sin(a) * 9;
      ctx.lineTo(x, y);
      if (w > 1 && r() < 0.12) {
        ctx.stroke();
        walk(x, y, a + (r() < 0.5 ? 1.2 : -1.2), Math.floor(len / 2), w * 0.6);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  };
  for (let i = 0; i < 26; i++) walk(r() * 256, r() * 512, r() * Math.PI * 2, 10 + Math.floor(r() * 14), 1.6 + r() * 1.4);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

interface PlantSlot {
  plot: number;
  x: number;
  z: number;
  rot: number;
  delay: number;
  size: number;
}

interface PolygonLayout {
  poly: XYPoint[];
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  slots: PlantSlot[];
  plotCenters: { x: number; z: number; maxZ: number }[];
}

function insideWithMargin(x: number, z: number, poly: readonly XYPoint[], margin: number): boolean {
  if (!pointInPolygon(x, z, poly)) return false;
  if (margin <= 0) return true;
  return (
    pointInPolygon(x + margin, z, poly) &&
    pointInPolygon(x - margin, z, poly) &&
    pointInPolygon(x, z + margin, poly) &&
    pointInPolygon(x, z - margin, poly)
  );
}

function buildPolygonLayout(poly: XYPoint[], maxTotal: number): PolygonLayout | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const sampleGrid = (margin: number) => {
    const pts: { x: number; z: number }[] = [];
    const gx = 30;
    const gz = 18;
    const dx = (maxX - minX) / gx;
    const dz = (maxZ - minZ) / gz;
    for (let ix = 0; ix < gx; ix++) {
      for (let iz = 0; iz < gz; iz++) {
        const jx = (((ix * 7 + iz * 13) % 11) / 11 - 0.5) * dx * 0.35;
        const jz = (((ix * 17 + iz * 5) % 11) / 11 - 0.5) * dz * 0.35;
        const x = minX + (ix + 0.5) * dx + jx;
        const z = minZ + (iz + 0.5) * dz + jz;
        if (insideWithMargin(x, z, poly, margin)) pts.push({ x, z });
      }
    }
    return pts;
  };

  let inside = sampleGrid(0.14);
  if (inside.length < 24) inside = sampleGrid(0);
  if (inside.length < 12) return null;

  inside.sort((a, b) => a.x - b.x || a.z - b.z);
  const count = Math.min(maxTotal, inside.length);
  const chosen: { x: number; z: number }[] = [];
  if (inside.length === count) {
    chosen.push(...inside);
  } else {
    for (let i = 0; i < count; i++) {
      chosen.push(inside[Math.floor((i * inside.length) / count)]);
    }
  }

  const plotCenters = Array.from({ length: 6 }, () => ({ x: 0, z: 0, maxZ: -Infinity, n: 0 }));
  const slots: PlantSlot[] = chosen.map((pt, i) => {
    const plot = Math.min(5, Math.floor((i * 6) / chosen.length));
    const c = plotCenters[plot];
    c.x += pt.x;
    c.z += pt.z;
    if (pt.z > c.maxZ) c.maxZ = pt.z;
    c.n++;
    return {
      plot,
      x: pt.x,
      z: pt.z,
      rot: ((i * 53) % 360) * (Math.PI / 180),
      delay: (i % 24) * 0.009,
      size: 0.85 + ((i * 29) % 10) / 40,
    };
  });

  return {
    poly,
    minX,
    maxX,
    minZ,
    maxZ,
    slots,
    plotCenters: plotCenters.map((c) => ({
      x: c.n ? c.x / c.n : 0,
      z: c.n ? c.z / c.n : 0,
      maxZ: c.n ? c.maxZ : maxZ,
    })),
  };
}

export function createPlantScene(host: HTMLElement, polygon?: Point[]): PlantHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = false;
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none";
  host.appendChild(canvas);

  const scene = new Scene();
  const hemi = new HemisphereLight("#fff6e0", "#3b2f20", 1.6);
  scene.add(hemi);
  const sun = new DirectionalLight("#fff1d0", 2.2);
  sun.position.set(-4, 8, 5);
  scene.add(sun);

  const camera = new PerspectiveCamera(36, 1, 0.1, 80);
  const field = new Group();
  scene.add(field);
  const totalW = 6 * PLOT_W + 5 * GAP;
  const perPlot = COLS * ROWS;
  const total = perPlot * 6;
  const polyPts = polygon && polygon.length >= 3 ? fitPolygonToField(polygon, totalW, PLOT_D) : null;
  const polyData = polyPts ? buildPolygonLayout(polyPts, total) : null;

  // Ground slab and soil bed(s): polygon-conforming extruded bed when drawn, else 6 rectangular plots.
  const disposables: { dispose(): void }[] = [];
  const slabMat = new MeshStandardMaterial({ color: "#3b2f20", roughness: 0.95 });
  const crackTex = crackTexture();
  const crackMat = new MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false });
  disposables.push(slabMat, crackTex, crackMat);

  const plotX = (i: number) => -totalW / 2 + PLOT_W / 2 + i * (PLOT_W + GAP);
  const plotMats: MeshStandardMaterial[] = [];
  const beds: Group[] = [];
  let polySoilMat: MeshStandardMaterial | null = null;

  if (polyData) {
    const shape = new Shape();
    polyData.poly.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, -p.z) : shape.lineTo(p.x, -p.z)));
    shape.closePath();

    const slabGeo = new ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.24, bevelSegments: 2, curveSegments: 1 });
    slabGeo.rotateX(-Math.PI / 2);
    const slab = new Mesh(slabGeo, slabMat);
    slab.position.y = -0.27;
    field.add(slab);

    const soilGeo = new ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.03, bevelSegments: 2, curveSegments: 1 });
    soilGeo.rotateX(-Math.PI / 2);
    polySoilMat = new MeshStandardMaterial({ color: "#5a4632", roughness: 0.9 });
    const soilBed = new Mesh(soilGeo, polySoilMat);
    soilBed.position.y = -0.04;
    field.add(soilBed);

    const crackGeo = new ShapeGeometry(shape);
    const uv = crackGeo.getAttribute("uv");
    const posAttr = crackGeo.getAttribute("position");
    const spanX = polyData.maxX - polyData.minX || 1;
    const spanZ = polyData.maxZ - polyData.minZ || 1;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (posAttr.getX(i) - polyData.minX) / spanX, (posAttr.getY(i) + polyData.maxZ) / spanZ);
    }
    uv.needsUpdate = true;
    crackGeo.rotateX(-Math.PI / 2);
    const crack = new Mesh(crackGeo, crackMat);
    crack.position.y = 0.084;
    crack.renderOrder = 1;
    field.add(crack);
    disposables.push(slabGeo, soilGeo, polySoilMat, crackGeo);

    // Clipped furrows strictly inside the drawn polygon
    for (let r = 0; r < ROWS; r++) {
      const z = polyData.minZ + ((r + 0.5) / ROWS) * (polyData.maxZ - polyData.minZ);
      const hits: number[] = [];
      for (let i = 0; i < polyData.poly.length; i++) {
        const a = polyData.poly[i];
        const b = polyData.poly[(i + 1) % polyData.poly.length];
        if ((a.z > z) !== (b.z > z)) hits.push(a.x + ((z - a.z) * (b.x - a.x)) / (b.z - a.z));
      }
      hits.sort((a, b) => a - b);
      for (let k = 0; k + 1 < hits.length; k += 2) {
        const x0 = hits[k] + 0.1;
        const x1 = hits[k + 1] - 0.1;
        if (x1 - x0 < 0.24) continue;
        const fg = new BoxGeometry(x1 - x0, 0.03, 0.06);
        const fm = new Mesh(fg, slabMat);
        fm.position.set((x0 + x1) / 2, 0.09, z);
        field.add(fm);
        disposables.push(fg);
      }
    }
  } else {
    const slabGeo = new BoxGeometry(totalW + 0.8, 0.3, PLOT_D + 0.8);
    const slab = new Mesh(slabGeo, slabMat);
    slab.position.y = -0.16;
    field.add(slab);
    const plotGeo = new BoxGeometry(PLOT_W, 0.12, PLOT_D);
    const crackGeo = new PlaneGeometry(PLOT_W * 0.98, PLOT_D * 0.98);
    disposables.push(slabGeo, plotGeo, crackGeo);
    for (let i = 0; i < 6; i++) {
      const bed = new Group();
      field.add(bed);
      beds.push(bed);
      const mat = new MeshStandardMaterial({ color: "#5a4632", roughness: 0.9 });
      const plot = new Mesh(plotGeo, mat);
      plot.position.set(plotX(i), 0.02, 0);
      bed.add(plot);
      plotMats.push(mat);
      disposables.push(mat);
      const crack = new Mesh(crackGeo, crackMat);
      crack.rotation.x = -Math.PI / 2;
      crack.position.set(plotX(i), 0.084, 0);
      crack.renderOrder = 1;
      bed.add(crack);
      // furrows
      for (let r = 0; r < ROWS; r++) {
        const fg = new BoxGeometry(PLOT_W * 0.9, 0.03, 0.06);
        const fm = new Mesh(fg, slabMat);
        fm.position.set(plotX(i), 0.09, -PLOT_D / 2 + (r + 0.5) * (PLOT_D / ROWS));
        bed.add(fm);
        disposables.push(fg);
      }
    }
  }

  // Instanced plants, one mesh per crop
  const plantMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: DoubleSide });
  disposables.push(plantMat);
  const models = {} as Record<CropId, InstancedMesh>;
  for (const { id } of CROPS) models[id] = new InstancedMesh(cropModel(id), plantMat, total);
  Object.values(models).forEach((m) => {
    for (let i = 0; i < total; i++) m.setColorAt(i, new Color("#ffffff"));
    field.add(m);
    disposables.push(m.geometry, m);
  });
  const slots: PlantSlot[] = polyData
    ? polyData.slots
    : Array.from({ length: total }, (_, i) => {
        const plot = Math.floor(i / perPlot);
        const j = i % perPlot;
        const c = j % COLS;
        const r = Math.floor(j / COLS);
        const jitter = (((i * 37) % 13) / 13 - 0.5) * 0.12;
        return {
          plot,
          x: plotX(plot) - PLOT_W / 2 + (c + 0.5) * (PLOT_W / COLS) + jitter,
          z: -PLOT_D / 2 + (r + 0.5) * (PLOT_D / ROWS),
          rot: ((i * 53) % 360) * (Math.PI / 180),
          delay: (r * COLS + c) * 0.009,
          size: 0.85 + ((i * 29) % 10) / 40,
        };
      });
  const plotCenter = (i: number) =>
    polyData ? polyData.plotCenters[i] : { x: plotX(i), z: 0, maxZ: PLOT_D / 2 };

  // The suit: a glowing sakura orb with a scan beam and its own light
  const drone = new Group();
  const orbGeo = new SphereGeometry(0.22, 20, 14);
  const orbMat = new MeshStandardMaterial({ color: "#f5bfcd", emissive: "#e0708f", emissiveIntensity: 1.4, roughness: 0.3 });
  drone.add(new Mesh(orbGeo, orbMat));
  const ringGeo = new CylinderGeometry(0.42, 0.42, 0.03, 32, 1, true);
  const ringMat = new MeshBasicMaterial({ color: "#f6efeb", transparent: true, opacity: 0.6, side: DoubleSide });
  const ring = new Mesh(ringGeo, ringMat);
  drone.add(ring);
  const beamGeo = new ConeGeometry(0.9, 2.6, 24, 1, true);
  const beamMat = new MeshBasicMaterial({ color: "#f5bfcd", transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const beam = new Mesh(beamGeo, beamMat);
  beam.position.y = -1.3;
  drone.add(beam);
  const droneLight = new PointLight("#ffd0dc", 10, 5, 1.5);
  droneLight.position.y = -0.4;
  drone.add(droneLight);
  const p0 = plotCenter(0);
  drone.position.set(p0.x, 2.6, p0.z);
  scene.add(drone);
  disposables.push(orbGeo, orbMat, ringGeo, ringMat, beamGeo, beamMat);

  // Blowing dust (shown in El Niño): small warm points drifting across the field.
  const DUST = 420;
  const dustPos = new Float32Array(DUST * 3);
  const dustSpeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * (totalW + 6);
    dustPos[i * 3 + 1] = 0.1 + Math.random() * 2.6;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * (PLOT_D + 4);
    dustSpeed[i] = 0.4 + Math.random() * 0.9;
  }
  const dustGeo = new BufferGeometry();
  dustGeo.setAttribute("position", new BufferAttribute(dustPos, 3));
  const dustMat = new PointsMaterial({ color: "#f0c896", size: 0.05, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
  const dust = new Points(dustGeo, dustMat);
  dust.visible = false;
  scene.add(dust);
  disposables.push(dustGeo, dustMat);
  let drought = 0;
  let droughtTarget = 0;
  // Spotlight: focused bed index, or -1 for all. lift/bright ease per bed.
  let focus = -1;
  const lift = [0, 0, 0, 0, 0, 0];
  const bright = [1, 1, 1, 1, 1, 1];
  const tint = new Color();
  let lastT = 0;
  const C = {
    sky: new Color("#fff6e0"),
    skyDry: new Color("#ffc58a"),
    ground: new Color("#3b2f20"),
    groundDry: new Color("#6a4424"),
    sun: new Color("#fff1d0"),
    sunDry: new Color("#ffad66"),
    slab: new Color("#3b2f20"),
    slabDry: new Color("#6e5234"),
    soil: new Color("#5a4632"),
    soilDry: new Color("#a3825a"),
  };
  const soilNow = new Color();

  let labels: Sprite[] = [];
  let plots: PlotSpec[] = [];
  let wilt = [false, false, false, false, false, false];
  let plantStart = -1;
  let seasonCb: ((i: number) => void) | null = null;
  let lastSeason = -2;
  let quickStart = -1; // quick replant: every bed grows from this time
  // Orbit: drag turns (yaw) and tilts (pitch); pinch or wheel zooms. All eased.
  let yaw = 0;
  let yawTarget = 0;
  let pitch = 0;
  let pitchTarget = 0;
  let zoom = 1;
  let zoomTarget = 1;
  let drag: { id: number; x: number; y: number; yaw: number; pitch: number } | null = null;
  let pinch: { d: number; zoom: number } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let visible = true;
  let dead = false;
  const t0 = performance.now();
  const landing = { from: new Vector3(0, 16, 2), to: new Vector3(0, 6.2, 8.4) };
  const dummy = new Object3D();
  const WILT = new Color("#b49a6a");
  const WHITE = new Color("#ffffff");
  let fit = 1;

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 1 ? 52 : 36;
    camera.updateProjectionMatrix();
    // Pull back until all 6 plots (and their labels) fit across the view.
    const halfTan = Math.tan((camera.fov * Math.PI) / 360) * camera.aspect;
    fit = Math.min(2.6, Math.max(1, 6.3 / (landing.to.length() * halfTan)));
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
  io.observe(host);

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  };
  const startDrag = (id: number, p: { x: number; y: number }) => (drag = { id, x: p.x, y: p.y, yaw: yawTarget, pitch: pitchTarget });
  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      drag = null;
      pinch = { d: spread(), zoom: zoomTarget };
    } else if (pointers.size === 1) startDrag(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) zoomTarget = clamp((pinch.zoom * pinch.d) / spread(), 0.6, 1.7);
    else if (drag && drag.id === e.pointerId) {
      yawTarget = clamp(drag.yaw + (e.clientX - drag.x) * 0.006, -0.9, 0.9);
      pitchTarget = clamp(drag.pitch + (e.clientY - drag.y) * 0.012, -2.2, 3.5);
    }
  };
  const onUp = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 2) pinch = { d: spread(), zoom: zoomTarget };
    else if (pointers.size < 2) pinch = null;
    if (pointers.size === 1) {
      const [id, pt] = [...pointers.entries()][0];
      startDrag(id, pt);
    }
    if (pointers.size === 0) {
      drag = null;
      canvas.style.cursor = "grab";
    }
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoomTarget = clamp(zoomTarget * Math.exp(e.deltaY * 0.0012), 0.6, 1.7);
  };
  const resetView = () => {
    yawTarget = 0;
    pitchTarget = 0;
    zoomTarget = 1;
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("lostpointercapture", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("dblclick", resetView);

  let raf = 0;
  const tick = (now: number) => {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    if (!visible) return;
    const t = (now - t0) / 1000;

    // Camera: land from above over 0.8 s, then drift and follow the drag / pinch.
    const land = Math.min(1, t / 0.8);
    const ease = 1 - Math.pow(1 - land, 3);
    yaw += (yawTarget + Math.sin(t * 0.15) * 0.12 - yaw) * 0.12;
    pitch += (pitchTarget - pitch) * 0.15;
    zoom += (zoomTarget - zoom) * 0.15;
    const base = landing.from.clone().lerp(landing.to.clone().multiplyScalar(fit), ease);
    const dist = Math.hypot(base.x, base.z) * zoom;
    camera.position.set(Math.sin(yaw) * dist, Math.max(1.2, base.y * zoom + pitch), Math.cos(yaw) * dist);
    camera.lookAt(0, 0.3, 0);

    // Planting progress
    const pt = plantStart < 0 ? -1 : t - plantStart;
    const season = pt < 0 ? -1 : quickStart >= 0 ? 6 : Math.min(6, Math.floor(pt / STEP));
    if (season !== lastSeason && seasonCb && pt >= 0) {
      lastSeason = season;
      seasonCb(season);
    }
    const active = focus >= 0 && season >= 6 ? focus : Math.min(5, Math.max(0, season));
    const activePos = plotCenter(active);
    drone.position.x += (activePos.x - drone.position.x) * 0.25;
    drone.position.z += (activePos.z - drone.position.z) * 0.25;
    drone.position.y = 2.6 + Math.sin(t * 2.2) * 0.12;
    ring.rotation.y = t * 1.5;
    const droneOn = season >= 0 && season < 6 ? 1 : 0;
    beamMat.opacity += (0.22 * droneOn - beamMat.opacity) * 0.2;
    droneLight.intensity += (10 * droneOn + 2 - droneLight.intensity) * 0.2;

    // El Niño: ease the light, soil, cracks and dust toward the drought look.
    const dt = Math.min(0.05, t - lastT);
    lastT = t;
    drought += (droughtTarget - drought) * 0.15;
    hemi.color.lerpColors(C.sky, C.skyDry, drought);
    hemi.groundColor.lerpColors(C.ground, C.groundDry, drought);
    hemi.intensity = 1.6 + 0.35 * drought;
    sun.color.lerpColors(C.sun, C.sunDry, drought);
    sun.intensity = 2.2 + 1.1 * drought;
    slabMat.color.lerpColors(C.slab, C.slabDry, drought);
    crackMat.opacity = 0.85 * drought;
    dustMat.opacity = 0.75 * drought;
    dust.visible = drought > 0.01;
    if (dust.visible) {
      const half = (totalW + 6) / 2;
      for (let i = 0; i < DUST; i++) {
        dustPos[i * 3] += dustSpeed[i] * dt * 1.4;
        dustPos[i * 3 + 1] += Math.sin(t * 1.7 + i) * dt * 0.12;
        if (dustPos[i * 3] > half) dustPos[i * 3] = -half;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }
    soilNow.lerpColors(C.soil, C.soilDry, drought);

    for (let p = 0; p < 6; p++) {
      const on = focus < 0 || focus === p;
      lift[p] += ((focus === p ? 0.32 : 0) - lift[p]) * 0.25;
      bright[p] += ((on ? 1 : 0.32) - bright[p]) * 0.25;
      if (!polyData) {
        beds[p].position.y = lift[p];
        const spec = plots[p];
        const planted = pt >= 0 && (quickStart >= 0 || pt >= p * STEP);
        const target = (spec && planted ? new Color(FAMILY_TINT[spec.family]) : soilNow.clone()).lerp(soilNow, 0.55).multiplyScalar(bright[p]);
        plotMats[p].color.lerp(target, 0.3);
      }
    }
    if (polySoilMat) {
      const activeSpec = focus >= 0 ? plots[focus] : plots[Math.min(5, Math.max(0, season))];
      const planted = pt >= 0 && (focus < 0 || quickStart >= 0 || pt >= focus * STEP);
      const target = (activeSpec && planted ? new Color(FAMILY_TINT[activeSpec.family]) : soilNow.clone()).lerp(soilNow, 0.65);
      polySoilMat.color.lerp(target, 0.2);
    }

    (Object.keys(models) as CropId[]).forEach((crop) => {
      const mesh = models[crop];
      // A crop with no bed this route stays hidden, and costs nothing per frame.
      mesh.visible = plots.some((p) => p.crop === crop);
      if (!mesh.visible) return;
      for (let i = 0; i < total; i++) {
        const s = slots[i];
        if (!s) {
          dummy.position.set(0, -10, 0);
          dummy.scale.set(0.0001, 0.0001, 0.0001);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const spec = plots[s.plot];
        let g = 0;
        if (spec && spec.crop === crop && pt >= 0) {
          const k = quickStart >= 0 ? (t - quickStart - s.delay * 0.5) / 0.3 : (pt - s.plot * STEP - s.delay) / GROW;
          g = k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3) * Math.cos(k * 4) ; // grow with a little overshoot
        }
        const w = wilt[s.plot];
        dummy.position.set(s.x, 0.08 + lift[s.plot], s.z);
        dummy.rotation.set(w ? 0.45 : Math.sin(t * 1.6 + s.x * 2 + s.z) * 0.06, s.rot, w ? 0.25 : Math.sin(t * 1.3 + s.z * 3) * 0.05);
        const sc = Math.max(0.0001, g * s.size * (w ? 0.78 : 1));
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (g > 0) mesh.setColorAt(i, tint.copy(w ? WILT : WHITE).multiplyScalar(bright[s.plot]));
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    });
    labels.forEach((l, i) => {
      const m = l.material as SpriteMaterial;
      const shown = quickStart >= 0 || pt >= i * STEP ? (focus < 0 || focus === i ? 1 : 0.35) : 0.25;
      m.opacity += (shown - m.opacity) * 0.25;
      l.position.y = 0.36 + lift[i];
    });
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    plant(next, onSeason, quick = false) {
      plots = next;
      wilt = next.map((p) => p.wilt);
      labels.forEach((l) => {
        field.remove(l);
        (l.material as SpriteMaterial).map?.dispose();
        l.material.dispose();
      });
      labels = next.map((p, i) => {
        const s = labelSprite(p.label);
        const c = plotCenter(i);
        s.position.set(c.x, 0.36, polyData ? Math.min(c.maxZ + 0.52, polyData.maxZ + 0.62) : PLOT_D / 2 + 0.62);
        field.add(s);
        return s;
      });
      seasonCb = onSeason;
      lastSeason = -2;
      const now = (performance.now() - t0) / 1000;
      plantStart = quick ? now : now + 0.1;
      quickStart = quick ? now : -1;
    },
    resetView,
    setWilt(next) {
      wilt = next;
    },
    setFocus(index) {
      focus = index === null ? -1 : index;
    },
    setDrought(on) {
      droughtTarget = on ? 1 : 0;
    },
    dispose() {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("lostpointercapture", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("dblclick", resetView);
      labels.forEach((l) => {
        (l.material as SpriteMaterial).map?.dispose();
        l.material.dispose();
      });
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      canvas.remove();
    },
  };
}
