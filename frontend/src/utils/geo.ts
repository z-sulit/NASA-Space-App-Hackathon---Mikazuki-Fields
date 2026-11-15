export type Point = { lat: number; lon: number };
export interface XYPoint {
  x: number;
  z: number;
}

const EARTH_RADIUS_M = 6371008.8;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two lat/lon points in kilometres (Haversine). */
export function distanceKm(a: Point, b: Point): number {
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return (2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))) / 1000;
}

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

/** Ray-casting point-in-polygon check (handles concave rings, independent of winding order). */
export function pointInPolygon(x: number, z: number, poly: readonly XYPoint[]): boolean {
  if (poly.length < 3) return false;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function orient2d(a: XYPoint, b: XYPoint, c: XYPoint): number {
  return (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
}

function onSegment(a: XYPoint, b: XYPoint, p: XYPoint, eps: number): boolean {
  return (
    p.x >= Math.min(a.x, b.x) - eps &&
    p.x <= Math.max(a.x, b.x) + eps &&
    p.z >= Math.min(a.z, b.z) - eps &&
    p.z <= Math.max(a.z, b.z) + eps
  );
}

function segmentsIntersect(a1: XYPoint, a2: XYPoint, b1: XYPoint, b2: XYPoint): boolean {
  const eps = 1e-9;
  const d1 = orient2d(b1, b2, a1);
  const d2 = orient2d(b1, b2, a2);
  const d3 = orient2d(a1, a2, b1);
  const d4 = orient2d(a1, a2, b2);
  if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) && ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) {
    return true;
  }
  if (Math.abs(d1) <= eps && onSegment(b1, b2, a1, eps)) return true;
  if (Math.abs(d2) <= eps && onSegment(b1, b2, a2, eps)) return true;
  if (Math.abs(d3) <= eps && onSegment(a1, a2, b1, eps)) return true;
  if (Math.abs(d4) <= eps && onSegment(a1, a2, b2, eps)) return true;
  return false;
}

/** True when any two non-adjacent edges of the closed ring cross or touch. */
export function hasSelfIntersection(poly: readonly XYPoint[]): boolean {
  const n = poly.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    const a1 = poly[i];
    const a2 = poly[(i + 1) % n];
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const b1 = poly[j];
      const b2 = poly[(j + 1) % n];
      if (segmentsIntersect(a1, a2, b1, b2)) return true;
    }
  }
  return false;
}

/**
 * Projects lat/lon polygon vertices to local meter space centred on the centroid (0, 0),
 * uniformly fitted within [-maxW/2, maxW/2] x [-maxD/2, maxD/2].
 * Returns null for invalid, collapsed, or self-intersecting rings.
 */
export function fitPolygonToField(ring: readonly Point[], maxW: number, maxD: number): XYPoint[] | null {
  if (ring.length < 3 || maxW <= 0 || maxD <= 0) return null;
  const clean: Point[] = [];
  for (const p of ring) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
    const prev = clean[clean.length - 1];
    if (!prev || Math.abs(p.lat - prev.lat) > 1e-9 || Math.abs(p.lon - prev.lon) > 1e-9) {
      clean.push(p);
    }
  }
  if (clean.length > 1) {
    const first = clean[0];
    const last = clean[clean.length - 1];
    if (Math.abs(first.lat - last.lat) <= 1e-9 && Math.abs(first.lon - last.lon) <= 1e-9) clean.pop();
  }
  if (clean.length < 3) return null;

  const c = ringCentroid(clean);
  const mPerLat = rad(1) * EARTH_RADIUS_M;
  const mPerLon = mPerLat * Math.cos(rad(c.lat));
  if (!Number.isFinite(mPerLon) || mPerLon <= 0) return null;

  const meters: XYPoint[] = clean.map((p) => ({
    x: (p.lon - c.lon) * mPerLon,
    z: -(p.lat - c.lat) * mPerLat,
  }));

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let area2 = 0;
  for (let i = 0; i < meters.length; i++) {
    const a = meters[i];
    const b = meters[(i + 1) % meters.length];
    if (a.x < minX) minX = a.x;
    if (a.x > maxX) maxX = a.x;
    if (a.z < minZ) minZ = a.z;
    if (a.z > maxZ) maxZ = a.z;
    area2 += a.x * b.z - b.x * a.z;
  }

  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  if (spanX < 1e-3 || spanZ < 1e-3 || Math.abs(area2) * 0.5 < spanX * spanZ * 1e-3) return null;
  if (hasSelfIntersection(meters)) return null;

  const maxAbsX = Math.max(Math.abs(minX), Math.abs(maxX));
  const maxAbsZ = Math.max(Math.abs(minZ), Math.abs(maxZ));
  const scale = Math.min(maxW / 2 / maxAbsX, maxD / 2 / maxAbsZ);
  return meters.map((p) => ({ x: p.x * scale, z: p.z * scale }));
}
