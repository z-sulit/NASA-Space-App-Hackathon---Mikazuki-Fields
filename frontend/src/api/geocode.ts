/**
 * Find a Philippine place by name (province, city, municipality, barangay) with
 * OpenStreetMap Nominatim, then hand its point to the normal tap flow (land check,
 * live NASA POWER), since GET /api/farm only takes preset_id or lat/lon.
 *
 * Nominatim's public usage policy: at most 1 request a second, and no search-as-you-type
 * from the browser. So searches run on submit only, are spaced at least 1.1 s apart,
 * and repeat queries come from a cache.
 */
import { inPhilippines } from "./power";

export interface Place {
  name: string;
  /** Province / region, for telling same-named towns apart. */
  context: string;
  lat: number;
  lon: number;
}

export class GeocodeError extends Error {
  constructor(public kind: "busy" | "offline" | "failed") {
    super(kind);
  }
}

const cache = new Map<string, Place[]>();
let nextSlot = 0;

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const key = query.trim().toLowerCase().replace(/\s+/g, " ");
  const hit = cache.get(key);
  if (hit) return hit;
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new GeocodeError("offline");

  const wait = nextSlot - Date.now();
  nextSlot = Math.max(Date.now(), nextSlot) + 1100;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  if (signal?.aborted) throw new DOMException("aborted", "AbortError");

  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ph&limit=5&accept-language=en&q=" + encodeURIComponent(key);
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new GeocodeError(navigator.onLine === false ? "offline" : "failed");
  }
  if (res.status === 429) throw new GeocodeError("busy");
  if (!res.ok) throw new GeocodeError("failed");
  const rows = (await res.json()) as { name?: string; display_name: string; lat: string; lon: string }[];
  const seen = new Set<string>();
  const places = rows
    .map((r) => {
      const parts = r.display_name.split(", ").filter((p) => p !== "Philippines" && !/^\d{4}$/.test(p));
      const name = r.name || parts[0];
      return { name, context: parts.filter((p) => p !== name).slice(-2).join(", "), lat: Number(r.lat), lon: Number(r.lon) };
    })
    .filter((p) => Number.isFinite(p.lat) && inPhilippines(p.lat, p.lon))
    .filter((p) => {
      const id = `${p.name}|${p.context}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  cache.set(key, places);
  return places;
}
