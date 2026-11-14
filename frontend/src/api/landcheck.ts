/**
 * Is the tapped point land a farm could be on, or a body of water?
 *
 * Reads the OpenStreetMap tile under the point (the same map the farmer sees) at zoom 12,
 * about 38 m per pixel, and looks at the 7×7 pixels around it. OSM draws every sea, lake,
 * river and reservoir in one water colour (#aad3df), so a mostly-water patch means the
 * point is water. Tiles allow cross-origin reads, so this works without the backend.
 *
 * NASA MODIS land cover (MCD12Q1) would also give built-up and forest classes, but the
 * ORNL service answered only about 1 in 5 requests when tested and one 500 m pixel is too
 * coarse near towns, so it is not used for the yes/no decision here.
 */
export type LandVerdict = { kind: "land" | "water" | "unknown"; waterShare: number };

const Z = 12;
const WATER: [number, number, number] = [0xaa, 0xd3, 0xdf];
const tiles = new Map<string, Promise<ImageData | null>>();

function tileXY(lat: number, lon: number) {
  const n = 2 ** Z;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.asinh(Math.tan((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  return { tx: Math.floor(x), ty: Math.floor(y), px: Math.floor((x % 1) * 256), py: Math.floor((y % 1) * 256) };
}

function loadTile(tx: number, ty: number): Promise<ImageData | null> {
  const key = `${tx}/${ty}`;
  let p = tiles.get(key);
  if (!p) {
    p = new Promise<ImageData | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = setTimeout(() => resolve(null), 6000);
      img.onload = () => {
        clearTimeout(timer);
        try {
          const c = document.createElement("canvas");
          c.width = c.height = 256;
          const ctx = c.getContext("2d", { willReadFrequently: true })!;
          ctx.drawImage(img, 0, 0);
          resolve(ctx.getImageData(0, 0, 256, 256));
        } catch {
          resolve(null); // tainted canvas or no 2D context
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      img.src = `https://tile.openstreetmap.org/${Z}/${tx}/${ty}.png`;
    });
    tiles.set(key, p);
    void p.then((d) => d === null && tiles.delete(key)); // let a failed tile be retried
  }
  return p;
}

export async function checkLand(lat: number, lon: number): Promise<LandVerdict> {
  const { tx, ty, px, py } = tileXY(lat, lon);
  const data = await loadTile(tx, ty);
  if (!data) return { kind: "unknown", waterShare: 0 };
  let water = 0;
  let n = 0;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = Math.min(255, Math.max(0, px + dx));
      const y = Math.min(255, Math.max(0, py + dy));
      const i = (y * 256 + x) * 4;
      const d = (data.data[i] - WATER[0]) ** 2 + (data.data[i + 1] - WATER[1]) ** 2 + (data.data[i + 2] - WATER[2]) ** 2;
      if (d < 14 ** 2) water++;
      n++;
    }
  }
  const waterShare = water / n;
  return { kind: waterShare >= 0.5 ? "water" : "land", waterShare };
}
