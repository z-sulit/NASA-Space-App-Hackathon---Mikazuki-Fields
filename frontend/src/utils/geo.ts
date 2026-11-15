type Point = { lat: number; lon: number };

const EARTH_RADIUS_M = 6371008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Geodesic area of a lat/lon ring in hectares (the ring closes itself; winding does not matter). */
export function ringAreaHa(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    sum += rad(b.lon - a.lon) * (2 + Math.sin(rad(a.lat)) + Math.sin(rad(b.lat)));
  }
  return Math.abs((sum * EARTH_RADIUS_M ** 2) / 2) / 10_000;
}

/** Area-weighted centre of a ring. shortcut: planar in degrees, fine for a farm; use a projection for shapes over ~50 km. */
export function ringCentroid(ring: Point[]): Point {
  let area = 0;
  let lat = 0;
  let lon = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const cross = a.lon * b.lat - b.lon * a.lat;
    area += cross;
    lat += (a.lat + b.lat) * cross;
    lon += (a.lon + b.lon) * cross;
  }
  // Corners on one line enclose nothing: fall back to their average.
  if (Math.abs(area) < 1e-14) return { lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length, lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length };
  return { lat: lat / (3 * area), lon: lon / (3 * area) };
}
