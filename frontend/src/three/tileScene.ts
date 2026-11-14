/**
 * WebGL hero tile (three.js): a beveled olive slab with the Mikazuki Fields mark
 * embossed (pearl crescent, sakura petals) on the front and a spec plate on the back, lit by a studio
 * environment so the metal picks up real reflections.
 *
 * Loaded lazily by HeroTile.tsx; the CSS Tile3D is the fallback when WebGL is
 * missing, the context is lost, or the visitor prefers reduced motion.
 * Geometry mirrors Emblem.tsx (same ring and flower proportions).
 */
import {
  ACESFilmicToneMapping,
  CanvasTexture,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EMBLEM } from "../components/Emblem";

export interface TileHandle {
  /** Spin the tile in from the side (call when the hero is revealed). */
  enter(): void;
  flip(): void;
  dispose(): void;
}

const TAU = Math.PI * 2;
const U = (2 / 96) * 0.74; // one emblem unit (of its 100-unit viewBox) in world units; the tile is 2 wide
// Emblem coordinates (SVG, y down) -> world (y up), centered on the tile.
const W = (x: number, y: number) => ({ x: (x - 50) * U, y: -(y - 50) * U });
const FRONT_Z = 0.12; // half the slab's thickness

/** The open crescent: outer circle minus the shifted inner circle, traced as two arcs between their crossing points. */
function crescentShape() {
  const oc = W(EMBLEM.outer.cx, EMBLEM.outer.cy);
  const ic = W(EMBLEM.inner.cx, EMBLEM.inner.cy);
  const ro = EMBLEM.outer.r * U;
  const ri = EMBLEM.inner.r * U;
  const dx = ic.x - oc.x;
  const dy = ic.y - oc.y;
  const d = Math.hypot(dx, dy);
  const a = (ro * ro - ri * ri + d * d) / (2 * d);
  const h = Math.sqrt(ro * ro - a * a);
  const mx = oc.x + (a * dx) / d;
  const my = oc.y + (a * dy) / d;
  const p1 = { x: mx + (h * dy) / d, y: my - (h * dx) / d };
  const p2 = { x: mx - (h * dy) / d, y: my + (h * dx) / d };
  const ang = (c: { x: number; y: number }, q: { x: number; y: number }) => Math.atan2(q.y - c.y, q.x - c.x);
  // Pick the arc direction whose midpoint faces `toward` (or away from it when `away`).
  const cw = (from: number, to: number, toward: number, away: boolean) => {
    const span = (((to - from) % TAU) + TAU) % TAU;
    const facing = Math.cos(from + span / 2 - toward) > 0;
    return away ? facing : !facing;
  };
  const toInner = Math.atan2(dy, dx);
  const a1 = ang(oc, p1);
  const a2 = ang(oc, p2);
  const b1 = ang(ic, p1);
  const b2 = ang(ic, p2);
  const s = new Shape();
  s.moveTo(p1.x, p1.y);
  s.absarc(oc.x, oc.y, ro, a1, a2, cw(a1, a2, toInner, true));
  s.absarc(ic.x, ic.y, ri, b2, b1, cw(b2, b1, toInner + Math.PI, false));
  return s;
}

/** One notched sakura petal pointing up (world +y) from the origin; mirrors petalPath() in Emblem.tsx. */
function petalShape(L: number) {
  const k = (L / 21) * U;
  const s = new Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(-7 * k, 3 * k, -12 * k, 12 * k, -8.5 * k, 19 * k);
  s.bezierCurveTo(-6.5 * k, 22 * k, -2.5 * k, 22 * k, 0, 18.5 * k);
  s.bezierCurveTo(2.5 * k, 22 * k, 6.5 * k, 22 * k, 8.5 * k, 19 * k);
  s.bezierCurveTo(12 * k, 12 * k, 7 * k, 3 * k, 0, 0);
  return s;
}

function roundedSquare(size: number, r: number) {
  const h = size / 2;
  const s = new Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.absarc(h - r, -h + r, r, -Math.PI / 2, 0, false);
  s.lineTo(h, h - r);
  s.absarc(h - r, h - r, r, 0, Math.PI / 2, false);
  s.lineTo(-h + r, h);
  s.absarc(-h + r, h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-h, -h + r);
  s.absarc(-h + r, -h + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** Text for the back of the tile, drawn on a canvas and used as a texture. */
function specPlate() {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d")!;
  const draw = () => {
    g.clearRect(0, 0, 512, 512);
    g.textBaseline = "top";
    g.fillStyle = "#f5bfcd";
    g.font = '500 30px "Inter Tight", Arial, sans-serif';
    g.fillText("U N I T   0 1", 0, 8);
    g.fillStyle = "#f6efeb";
    g.font = '400 92px "Inter Tight", Arial, sans-serif';
    g.fillText("Mikazuki", 0, 70);
    g.fillText("Fields", 0, 160);
    g.fillStyle = "rgba(244,237,230,0.78)";
    g.font = '500 27px "Inter Tight", Arial, sans-serif';
    ["3 ROUTES · 6 SEASONS", "8 CROPS · 3 FARMS", "NASA POWER · SRTM · MODIS"].forEach((line, i) => g.fillText(line, 0, 372 + i * 44));
  };
  draw();
  const texture = new CanvasTexture(c);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  // Redraw once the web font is in, so the plate matches the page's type.
  document.fonts?.ready.then(() => {
    draw();
    texture.needsUpdate = true;
  });
  return texture;
}

export function createTileScene(host: HTMLElement, onFace: (flipped: boolean) => void, onFail: () => void): TileHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth, host.clientHeight, false);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const canvas = renderer.domElement;
  canvas.style.cssText = "width:100%;height:100%;display:block;touch-action:none;cursor:grab";
  host.appendChild(canvas);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.38; // the room is bright; keep the slab dark olive, not grey
  const key = new DirectionalLight(0xfff1cf, 1.7);
  key.position.set(2.5, 3.5, 4);
  scene.add(key);
  const rim = new DirectionalLight(0xd4de72, 0.9);
  rim.position.set(-3, -1, -3);
  scene.add(rim);

  // The tile fills 1/1.9 of the canvas, leaving room to spin without clipping.
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.z = (2 * 1.9) / (2 * Math.tan((15 * Math.PI) / 180));

  const tile = new Group();
  scene.add(tile);

  // Slab
  const slabGeo = new ExtrudeGeometry(roundedSquare(1.9, 0.46), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 8, curveSegments: 28 });
  slabGeo.center();
  const slabMat = new MeshPhysicalMaterial({ color: 0x27330f, roughness: 0.6, metalness: 0.05, clearcoat: 0.3, clearcoatRoughness: 0.4 });
  tile.add(new Mesh(slabGeo, slabMat));

  // Embossed mark: pearl crescent, five sakura petals, deep-pink center
  const gold = new MeshPhysicalMaterial({ color: 0xefe6dc, metalness: 0.35, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.8 });
  const rust = new MeshStandardMaterial({ color: 0xf5bfcd, metalness: 0.05, roughness: 0.55, emissive: 0x6b1f35, emissiveIntensity: 0.12 });
  const centerMat = new MeshStandardMaterial({ color: 0xd94f7a, metalness: 0.1, roughness: 0.45 });
  const emboss = { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 4, curveSegments: 56 };
  const ringGeo = new ExtrudeGeometry(crescentShape(), emboss);
  const ringMesh = new Mesh(ringGeo, gold);
  ringMesh.position.z = FRONT_Z;
  tile.add(ringMesh);

  const fc = W(EMBLEM.flower.cx, EMBLEM.flower.cy);
  const petalGeo = new ExtrudeGeometry(petalShape(EMBLEM.flower.petal), { ...emboss, depth: 0.022, curveSegments: 24 });
  for (let i = 0; i < 5; i++) {
    const petal = new Mesh(petalGeo, rust);
    petal.position.set(fc.x, fc.y, FRONT_Z + 0.004 * i); // tiny steps so overlapping petals never z-fight
    petal.rotation.z = (-i * 72 * Math.PI) / 180;
    tile.add(petal);
  }
  const dotGeo = new SphereGeometry(3.4 * U, 24, 16);
  const dot = new Mesh(dotGeo, centerMat);
  dot.scale.z = 0.6;
  dot.position.set(fc.x, fc.y, FRONT_Z + 0.05);
  tile.add(dot);

  // Spec plate on the back
  const plateTex = specPlate();
  const plateGeo = new PlaneGeometry(1.36, 1.36);
  const plateMat = new MeshBasicMaterial({ map: plateTex, transparent: true, toneMapped: false });
  const plate = new Mesh(plateGeo, plateMat);
  plate.position.z = -FRONT_Z - 0.002;
  plate.rotation.y = Math.PI;
  tile.add(plate);

  // ---- Motion: spring toward a face, with sway, pointer lean, drag and flick ----
  const s = { rx: 0, ry: 0, vx: 0, vy: 0, face: 0, scale: 1, dragging: false, moved: 0, lastX: 0, lastY: 0, px: 0, py: 0, visible: true, dead: false };
  const t0 = performance.now();
  let raf = 0;

  const setFace = (face: number) => {
    s.face = face;
    onFace(Math.abs(face) % 2 === 1);
  };

  const tick = (now: number) => {
    if (s.dead) return;
    raf = requestAnimationFrame(tick);
    if (!s.visible) return;
    if (!s.dragging) {
      const t = (now - t0) / 1000;
      const targetRy = s.face * Math.PI + Math.sin(t * 0.8) * 0.16 + s.px * 0.3;
      const targetRx = Math.sin(t * 0.6) * 0.07 + s.py * 0.2;
      s.vy = (s.vy + (targetRy - s.ry) * 0.045) * 0.86;
      s.vx = (s.vx + (targetRx - s.rx) * 0.045) * 0.86;
      s.ry += s.vy;
      s.rx += s.vx;
    }
    s.scale += (1 - s.scale) * 0.08;
    tile.rotation.set(s.rx, s.ry, 0);
    tile.scale.setScalar(s.scale);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(tick);

  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
    s.dragging = true;
    s.moved = 0;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
  };
  const onDrag = (e: PointerEvent) => {
    if (!s.dragging) return;
    const dx = e.clientX - s.lastX;
    const dy = e.clientY - s.lastY;
    s.lastX = e.clientX;
    s.lastY = e.clientY;
    s.moved += Math.abs(dx) + Math.abs(dy);
    s.ry += dx * 0.011;
    s.rx = Math.max(-1, Math.min(1, s.rx + dy * 0.008));
    s.vy = Math.max(-0.25, Math.min(0.25, dx * 0.011)); // carried into the spring as a flick
    s.vx = 0;
  };
  const onUp = () => {
    if (!s.dragging) return;
    s.dragging = false;
    canvas.style.cursor = "grab";
    // A tap flips; a drag settles on whichever face is nearest (plus the flick's momentum).
    setFace(s.moved < 6 ? s.face + 1 : Math.round((s.ry + s.vy * 8) / Math.PI));
  };
  const onLean = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || s.dragging) return;
    s.px = (e.clientX / window.innerWidth) * 2 - 1;
    s.py = (e.clientY / window.innerHeight) * 2 - 1;
  };
  const onLost = (e: Event) => {
    e.preventDefault();
    onFail();
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onDrag);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("webglcontextlost", onLost);
  window.addEventListener("pointermove", onLean);
  const io = new IntersectionObserver(([entry]) => (s.visible = entry.isIntersecting));
  io.observe(host);

  return {
    enter() {
      s.ry = s.face * Math.PI - 2.6;
      s.vy = 0;
      s.scale = 0.55;
    },
    flip() {
      setFace(s.face + 1);
    },
    dispose() {
      s.dead = true;
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onLean);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onDrag);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("webglcontextlost", onLost);
      [slabGeo, ringGeo, petalGeo, dotGeo, plateGeo].forEach((g) => g.dispose());
      [slabMat, gold, rust, centerMat, plateMat].forEach((m) => m.dispose());
      plateTex.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
