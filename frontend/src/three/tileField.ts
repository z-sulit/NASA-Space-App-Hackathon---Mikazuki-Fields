/**
 * Frame 1, "Green tiles": a field of rounded olive tiles (one instanced mesh) seen
 * from above at an angle. Tiles ripple gently, rise around the pointer like a
 * crop pushed by wind, and flip to a crop color when tapped. exit() drops them
 * away in a wave from the center, then calls onExited.
 */
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Fog,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  PMREMGenerator,
  PointLight,
  Raycaster,
  Scene,
  SRGBColorSpace,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export interface FieldHandle {
  exit(onExited: () => void): void;
  dispose(): void;
}

const COLS = 30;
const ROWS = 22;
const GAP = 1.06;
const OLIVES = ["#3b4719", "#44521f", "#4d5c26", "#56662c", "#5f7033", "#36421a"];
const CROP_TOPS = ["#a87c0e", "#4d8b3a", "#8e5ba8", "#f5bfcd", "#c99a2e"];

export function createTileField(host: HTMLElement): FieldHandle {
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor("#232c0e");
  const canvas = renderer.domElement;
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
  host.appendChild(canvas);

  const scene = new Scene();
  scene.fog = new Fog("#232c0e", 14, 30);
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.45;
  const sun = new DirectionalLight("#fff1d6", 2.4);
  sun.position.set(-6, 10, 4);
  scene.add(sun);
  const fill = new DirectionalLight("#f5bfcd", 0.5);
  fill.position.set(6, 3, -4);
  scene.add(fill);
  // A warm light that follows the pointer, so hovered tiles really light up.
  const lamp = new PointLight("#f3ffb8", 0, 7, 1.6);
  lamp.position.set(0, 2.2, 0);
  scene.add(lamp);
  const GLOW = new Color("#c9e86a");
  const SAKURA_GLOW = new Color("#ffd6e2");
  const tmp = new Color();

  const camera = new PerspectiveCamera(38, 1, 0.1, 60);
  const lookAt = new Vector3(0, 0, 0.6);

  const geo = new RoundedBoxGeometry(0.94, 0.34, 0.94, 3, 0.13);
  const mat = new MeshStandardMaterial({ roughness: 0.62, metalness: 0.08 });
  const count = COLS * ROWS;
  const mesh = new InstancedMesh(geo, mat, count);
  scene.add(mesh);

  const tiles = Array.from({ length: count }, (_, i) => {
    const c = i % COLS;
    const r = Math.floor(i / COLS);
    const x = (c - (COLS - 1) / 2) * GAP;
    const z = (r - (ROWS - 1) / 2) * GAP;
    const base = new Color(OLIVES[(c * 7 + r * 13) % OLIVES.length]);
    if ((c * 31 + r * 17) % 41 === 0) base.set("#f5bfcd"); // a few sakura tiles in the field
    mesh.setColorAt(i, base);
    return { x, z, y: -3, vy: 0, flip: 0, flipTarget: 0, base, enter: 0.2 + Math.hypot(x, z) * 0.045, exitAt: Infinity };
  });
  mesh.instanceColor!.needsUpdate = true;

  const dummy = new Object3D();
  const pointer = new Vector2(10, 10);
  const hit = new Vector3(999, 0, 999);
  const ray = new Raycaster();
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  let hasPointer = false;
  // Ripples spread outward from each newly hovered tile.
  const ripples: { x: number; z: number; t: number }[] = [];
  let lastTile = -1;
  let exiting = false;
  let exitCb: (() => void) | null = null;
  let exitStart = 0;
  let down = { x: 0, y: 0, t: 0 };
  let visible = true;
  let dead = false;
  const t0 = performance.now();

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull the camera back on narrow screens so the field still fills the frame.
    const dist = w / h < 1 ? 17 : 12.5;
    camera.position.set(0, dist * 0.82, dist * 0.62);
    camera.lookAt(lookAt);
    camera.updateProjectionMatrix();
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(host);

  const updateHit = () => {
    ray.setFromCamera(pointer, camera);
    if (!ray.ray.intersectPlane(ground, hit)) hit.set(999, 0, 999);
  };

  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    hasPointer = true;
  };
  const onLeave = () => {
    hasPointer = false;
    hit.set(999, 0, 999);
  };
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
    onMove(e);
  };
  const onUp = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8) return;
    onMove(e);
    updateHit();
    // Flip the tapped tile and its 4 neighbors to crop colors, like planting a patch.
    const c = Math.round(hit.x / GAP + (COLS - 1) / 2);
    const r = Math.round(hit.z / GAP + (ROWS - 1) / 2);
    const color = new Color(CROP_TOPS[Math.floor(Math.random() * CROP_TOPS.length)]);
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr], k) => {
      const cc = c + dc;
      const rr = r + dr;
      if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) return;
      const t = tiles[rr * COLS + cc];
      t.flipTarget += Math.PI;
      setTimeout(() => {
        const next = t.base.equals(color) ? new Color(OLIVES[(cc + rr) % OLIVES.length]) : color;
        t.base = next.clone();
        mesh.setColorAt(rr * COLS + cc, t.base);
        mesh.instanceColor!.needsUpdate = true;
      }, 160 + k * 40);
    });
  };
  host.addEventListener("pointermove", onMove);
  host.addEventListener("pointerleave", onLeave);
  host.addEventListener("pointerdown", onDown);
  host.addEventListener("pointerup", onUp);
  const io = new IntersectionObserver(([en]) => (visible = en.isIntersecting));
  io.observe(host);

  let raf = 0;
  const tick = (now: number) => {
    if (dead) return;
    raf = requestAnimationFrame(tick);
    if (!visible) return;
    const t = (now - t0) / 1000;
    if (hasPointer) {
      updateHit();
      const c = Math.round(hit.x / GAP + (COLS - 1) / 2);
      const r = Math.round(hit.z / GAP + (ROWS - 1) / 2);
      const idx = c >= 0 && r >= 0 && c < COLS && r < ROWS ? r * COLS + c : -1;
      if (idx !== lastTile && idx >= 0 && !exiting) {
        lastTile = idx;
        ripples.push({ x: tiles[idx].x, z: tiles[idx].z, t });
        if (ripples.length > 5) ripples.shift();
      }
    }
    lamp.position.x += ((hasPointer ? hit.x : 0) - lamp.position.x) * 0.2;
    lamp.position.z += ((hasPointer ? hit.z : 0) - lamp.position.z) * 0.2;
    lamp.intensity += ((hasPointer && !exiting ? 26 : 0) - lamp.intensity) * 0.1;

    // The camera drifts a little with the pointer, so the field feels like a place.
    camera.position.x += ((hasPointer ? pointer.x * 0.9 : Math.sin(t * 0.2) * 0.4) - camera.position.x) * 0.03;
    camera.lookAt(lookAt);

    let allGone = exiting;
    for (let i = 0; i < count; i++) {
      const tile = tiles[i];
      let target: number;
      if (exiting) {
        const k = (now - exitStart) / 1000 - tile.exitAt;
        target = k > 0 ? -9 : 0;
        if (k < 1.1) allGone = false;
      } else if (t < tile.enter) {
        target = -3;
      } else {
        const d2 = (tile.x - hit.x) ** 2 + (tile.z - hit.z) ** 2;
        const wave = Math.sin(t * 1.3 + tile.x * 0.32 + tile.z * 0.24) * 0.09;
        let ring = 0;
        for (const rp of ripples) {
          const age = t - rp.t;
          if (age > 1.6) continue;
          const d = Math.hypot(tile.x - rp.x, tile.z - rp.z);
          ring += 0.32 * Math.exp(-((d - age * 6) ** 2) / 0.7) * (1 - age / 1.6);
        }
        const glow = Math.exp(-d2 / 1.8);
        target = wave + 1.05 * glow + ring;
        // Light up: hovered tiles brighten toward lime (sakura tiles toward pale pink).
        const isSakura = tile.base.r > 0.8;
        tmp.copy(tile.base).lerp(isSakura ? SAKURA_GLOW : GLOW, Math.min(1, glow * 0.85 + ring * 0.9));
        mesh.setColorAt(i, tmp);
      }
      tile.vy = (tile.vy + (target - tile.y) * (exiting ? 0.03 : 0.09)) * (exiting ? 0.95 : 0.78);
      tile.y += tile.vy;
      tile.flip += (tile.flipTarget - tile.flip) * 0.12;
      dummy.position.set(tile.x, tile.y, tile.z);
      dummy.rotation.set(tile.flip + (exiting ? Math.max(0, -tile.y) * 0.12 : 0), 0, 0);
      const s = exiting ? Math.max(0.2, 1 + tile.y * 0.05) : 1;
      dummy.scale.set(s, 1, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor!.needsUpdate = true;
    renderer.render(scene, camera);
    if (allGone && exitCb) {
      const cb = exitCb;
      exitCb = null;
      cb();
    }
  };
  raf = requestAnimationFrame(tick);

  return {
    exit(onExited) {
      exiting = true;
      exitStart = performance.now();
      exitCb = onExited;
      tiles.forEach((tile) => (tile.exitAt = Math.hypot(tile.x, tile.z) * 0.035));
    },
    dispose() {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      host.removeEventListener("pointermove", onMove);
      host.removeEventListener("pointerleave", onLeave);
      host.removeEventListener("pointerdown", onDown);
      host.removeEventListener("pointerup", onUp);
      geo.dispose();
      mat.dispose();
      mesh.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
