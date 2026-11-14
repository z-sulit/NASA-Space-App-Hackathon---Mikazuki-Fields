/**
 * Step 05, the plantation, in WebGL: six soil plots, one per season, planted one
 * after another by the hovering suit. Plants are real 3D models built from
 * primitives (corn-like grasses, bushy beans, spreading sweet-potato vines),
 * drawn as one instanced mesh per crop family so ~200 plants stay cheap.
 * The camera lands from above, then drifts; drag to orbit.
 */
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  AdditiveBlending,
  DoubleSide,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Family } from "../types";

export interface PlotSpec {
  family: Family;
  label: string;
  wilt: boolean;
}
export interface PlantHandle {
  /** Replant the field (season by season). onSeason(i) fires as each plot starts; i = 6 when done. */
  plant(plots: PlotSpec[], onSeason: (i: number) => void): void;
  /** Update wilting (dry spell) without replanting. */
  setWilt(wilt: boolean[]): void;
  dispose(): void;
}

const PLOT_W = 1.5;
const PLOT_D = 4.2;
const GAP = 0.22;
const COLS = 3;
const ROWS = 8;
const STEP = 0.55; // seconds between seasons
const FAMILY_TINT: Record<Family, string> = { Poaceae: "#a87c0e", Fabaceae: "#4d8b3a", Convolvulaceae: "#8e5ba8" };

/** Paint a geometry one solid color (vertex colors), so parts can be merged into one plant. */
function paint(g: BufferGeometry, hex: string) {
  const c = new Color(hex);
  const n = g.getAttribute("position").count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new Float32BufferAttribute(arr, 3));
  g.deleteAttribute("uv");
  return g;
}
const at = (g: BufferGeometry, m: Matrix4) => g.applyMatrix4(m);
const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);

function grassModel() {
  const parts: BufferGeometry[] = [];
  parts.push(paint(at(new CylinderGeometry(0.025, 0.035, 0.9, 6), T(0, 0.45, 0)), "#5d8a2c"));
  for (let k = 0; k < 4; k++) {
    const leaf = new PlaneGeometry(0.08, 0.5, 1, 3);
    const pos = leaf.getAttribute("position");
    for (let i = 0; i < pos.count; i++) pos.setZ(i, (pos.getY(i) + 0.25) ** 2 * 0.6); // arch the leaf
    leaf.computeVertexNormals();
    const m = new Matrix4().makeRotationY((k * Math.PI) / 2 + 0.4).multiply(new Matrix4().makeRotationX(-0.9)).premultiply(T(0, 0.25 + k * 0.13, 0));
    parts.push(paint(at(leaf, m), k % 2 ? "#6f9a35" : "#4f7d27"));
  }
  parts.push(paint(at(new SphereGeometry(0.07, 8, 6).scale(1, 2.4, 1), T(0, 0.98, 0)), "#e3b341"));
  return mergeGeometries(parts)!;
}
function beanModel() {
  const parts: BufferGeometry[] = [paint(at(new CylinderGeometry(0.02, 0.03, 0.3, 5), T(0, 0.15, 0)), "#4a6f22")];
  const blobs = [
    [0, 0.42, 0, 0.2],
    [0.16, 0.32, 0.06, 0.15],
    [-0.15, 0.33, -0.05, 0.15],
    [0.05, 0.3, -0.16, 0.14],
    [-0.04, 0.3, 0.16, 0.14],
  ];
  blobs.forEach(([x, y, z, r], i) => parts.push(paint(at(new SphereGeometry(r, 9, 7), T(x, y, z)), i % 2 ? "#5da344" : "#4d8b3a")));
  parts.push(paint(at(new SphereGeometry(0.035, 6, 4).scale(1, 2.2, 1), T(0.2, 0.22, 0.12)), "#b7d36a"));
  return mergeGeometries(parts)!;
}
function vineModel() {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    const r = 0.18 + (k % 2) * 0.07;
    parts.push(paint(at(new SphereGeometry(0.12, 8, 6).scale(1.2, 0.35, 1), T(Math.cos(a) * r, 0.08 + (k % 2) * 0.05, Math.sin(a) * r)), k % 2 ? "#7a9c3a" : "#6a5a8e"));
  }
  parts.push(paint(at(new SphereGeometry(0.11, 8, 6).scale(1, 0.6, 1), T(0, 0.2, 0)), "#8e5ba8"));
  return mergeGeometries(parts)!;
}

function labelSprite(text: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(29,36,10,0.72)";
  g.beginPath();
  g.roundRect(4, 14, 504, 68, 34);
  g.fill();
  g.fillStyle = "#f6efeb";
  g.font = '500 34px "Inter Tight", Arial, sans-serif';
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text.toUpperCase(), 256, 49);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const s = new Sprite(new SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.5, 0.28, 1);
  return s;
}

export function createPlantScene(host: HTMLElement): PlantHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = false;
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:pan-y";
  host.appendChild(canvas);

  const scene = new Scene();
  scene.add(new HemisphereLight("#fff6e0", "#3b2f20", 1.6));
  const sun = new DirectionalLight("#fff1d0", 2.2);
  sun.position.set(-4, 8, 5);
  scene.add(sun);

  const camera = new PerspectiveCamera(36, 1, 0.1, 80);
  const field = new Group();
  scene.add(field);
  const totalW = 6 * PLOT_W + 5 * GAP;

  // Ground slab and six plots
  const disposables: { dispose(): void }[] = [];
  const slabGeo = new BoxGeometry(totalW + 0.8, 0.3, PLOT_D + 0.8);
  const slabMat = new MeshStandardMaterial({ color: "#3b2f20", roughness: 0.95 });
  const slab = new Mesh(slabGeo, slabMat);
  slab.position.y = -0.16;
  field.add(slab);
  const plotGeo = new BoxGeometry(PLOT_W, 0.12, PLOT_D);
  disposables.push(slabGeo, slabMat, plotGeo);
  const plotX = (i: number) => -totalW / 2 + PLOT_W / 2 + i * (PLOT_W + GAP);
  const plotMats: MeshStandardMaterial[] = [];
  for (let i = 0; i < 6; i++) {
    const mat = new MeshStandardMaterial({ color: "#5a4632", roughness: 0.9 });
    const plot = new Mesh(plotGeo, mat);
    plot.position.set(plotX(i), 0.02, 0);
    field.add(plot);
    plotMats.push(mat);
    disposables.push(mat);
    // furrows
    for (let r = 0; r < ROWS; r++) {
      const fg = new BoxGeometry(PLOT_W * 0.9, 0.03, 0.06);
      const fm = new Mesh(fg, slabMat);
      fm.position.set(plotX(i), 0.09, -PLOT_D / 2 + (r + 0.5) * (PLOT_D / ROWS));
      field.add(fm);
      disposables.push(fg);
    }
  }

  // Instanced plants, one mesh per family
  const plantMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: DoubleSide });
  disposables.push(plantMat);
  const perPlot = COLS * ROWS;
  const total = perPlot * 6;
  const models: Record<Family, InstancedMesh> = {
    Poaceae: new InstancedMesh(grassModel(), plantMat, total),
    Fabaceae: new InstancedMesh(beanModel(), plantMat, total),
    Convolvulaceae: new InstancedMesh(vineModel(), plantMat, total),
  };
  Object.values(models).forEach((m) => {
    for (let i = 0; i < total; i++) m.setColorAt(i, new Color("#ffffff"));
    field.add(m);
    disposables.push(m.geometry, m);
  });
  const slots = Array.from({ length: total }, (_, i) => {
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
      delay: (r * COLS + c) * 0.018,
      size: 0.85 + ((i * 29) % 10) / 40,
    };
  });

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
  drone.position.set(plotX(0), 2.6, 0);
  scene.add(drone);
  disposables.push(orbGeo, orbMat, ringGeo, ringMat, beamGeo, beamMat);

  let labels: Sprite[] = [];
  let plots: PlotSpec[] = [];
  let wilt = [false, false, false, false, false, false];
  let plantStart = -1;
  let seasonCb: ((i: number) => void) | null = null;
  let lastSeason = -2;
  let yaw = 0;
  let yawTarget = 0;
  let drag: { x: number; yaw: number } | null = null;
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

  const onDown = (e: PointerEvent) => {
    drag = { x: e.clientX, yaw: yawTarget };
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    yawTarget = Math.max(-0.9, Math.min(0.9, drag.yaw + (e.clientX - drag.x) * 0.006));
  };
  const onUp = () => {
    drag = null;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  let raf = 0;
  const tick = (now: number) => {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    if (!visible) return;
    const t = (now - t0) / 1000;

    // Camera: land from above over 1.8 s, then drift and follow the drag.
    const land = Math.min(1, t / 1.8);
    const ease = 1 - Math.pow(1 - land, 3);
    yaw += (yawTarget + Math.sin(t * 0.15) * 0.12 - yaw) * 0.05;
    const base = landing.from.clone().lerp(landing.to.clone().multiplyScalar(fit), ease);
    const dist = Math.hypot(base.x, base.z);
    camera.position.set(Math.sin(yaw) * dist, base.y, Math.cos(yaw) * dist);
    camera.lookAt(0, 0.3, 0);

    // Planting progress
    const pt = plantStart < 0 ? -1 : t - plantStart;
    const season = pt < 0 ? -1 : Math.min(6, Math.floor(pt / STEP));
    if (season !== lastSeason && seasonCb && pt >= 0) {
      lastSeason = season;
      seasonCb(season);
    }
    const active = Math.min(5, Math.max(0, season));
    drone.position.x += (plotX(active) - drone.position.x) * 0.12;
    drone.position.y = 2.6 + Math.sin(t * 2.2) * 0.12;
    ring.rotation.y = t * 1.5;
    const droneOn = season >= 0 && season < 6 ? 1 : 0;
    beamMat.opacity += (0.22 * droneOn - beamMat.opacity) * 0.1;
    droneLight.intensity += (10 * droneOn + 2 - droneLight.intensity) * 0.1;

    for (let p = 0; p < 6; p++) {
      const spec = plots[p];
      const planted = pt >= 0 && pt >= p * STEP;
      const target = new Color(spec && planted ? FAMILY_TINT[spec.family] : "#5a4632").lerp(new Color("#5a4632"), 0.55);
      plotMats[p].color.lerp(target, 0.08);
    }

    (Object.keys(models) as Family[]).forEach((fam) => {
      const mesh = models[fam];
      for (let i = 0; i < total; i++) {
        const s = slots[i];
        const spec = plots[s.plot];
        let g = 0;
        if (spec && spec.family === fam && pt >= 0) {
          const k = (pt - s.plot * STEP - s.delay) / 0.6;
          g = k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3) * Math.cos(k * 4) ; // grow with a little overshoot
        }
        const w = wilt[s.plot];
        dummy.position.set(s.x, 0.08, s.z);
        dummy.rotation.set(w ? 0.45 : Math.sin(t * 1.6 + s.x * 2 + s.z) * 0.06, s.rot, w ? 0.25 : Math.sin(t * 1.3 + s.z * 3) * 0.05);
        const sc = Math.max(0.0001, g * s.size * (w ? 0.78 : 1));
        dummy.scale.set(sc, sc, sc);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (g > 0) mesh.setColorAt(i, w ? WILT : WHITE);
      }
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.needsUpdate = true;
    });
    labels.forEach((l, i) => {
      const m = l.material as SpriteMaterial;
      m.opacity += ((pt >= i * STEP ? 1 : 0.25) - m.opacity) * 0.1;
    });
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  return {
    plant(next, onSeason) {
      plots = next;
      wilt = next.map((p) => p.wilt);
      labels.forEach((l) => {
        field.remove(l);
        (l.material as SpriteMaterial).map?.dispose();
        l.material.dispose();
      });
      labels = next.map((p, i) => {
        const s = labelSprite(p.label);
        s.position.set(plotX(i), 0.3, PLOT_D / 2 + 0.55);
        field.add(s);
        return s;
      });
      seasonCb = onSeason;
      lastSeason = -2;
      plantStart = (performance.now() - t0) / 1000 + 0.35;
    },
    setWilt(next) {
      wilt = next;
    },
    dispose() {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
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
