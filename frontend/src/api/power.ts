import type { Preset, SeasonClimate } from "../types";

/**
 * Live NASA POWER climate for any point (the API allows browser requests).
 * Same math as scripts/fetch_mock_climate.py: monthly 2015–2024 averages folded
 * into a wet season (Jun–Nov) and a dry season (Dec–May).
 * Slope and green cover are borrowed from the nearest preset until the SRTM / MODIS
 * pulls exist, and are marked as placeholders.
 */
const PARAMS = "T2M,T2M_MAX,PRECTOTCORR,GWETROOT,ALLSKY_SFC_SW_DWN";
const WET = [6, 7, 8, 9, 10, 11];
const DRY = [12, 1, 2, 3, 4, 5];
const YEARS = Array.from({ length: 10 }, (_, i) => 2015 + i);
const daysIn = (m: number) => new Date(2021, m, 0).getDate();
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Rough Philippines box; points outside it are refused. */
export const PH_BOUNDS = { south: 4.4, west: 116.0, north: 21.3, east: 127.0 };
export const inPhilippines = (lat: number, lon: number) =>
  lat >= PH_BOUNDS.south && lat <= PH_BOUNDS.north && lon >= PH_BOUNDS.west && lon <= PH_BOUNDS.east;

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
export const nearestPreset = (presets: Preset[], lat: number, lon: number) =>
  [...presets].sort((a, b) => km({ lat, lon }, a) - km({ lat, lon }, b))[0];

const cache = new Map<string, Preset>();

export async function fetchPointPreset(lat: number, lon: number, presets: Preset[]): Promise<{ preset: Preset; live: boolean }> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const near = nearestPreset(presets, lat, lon);
  const distance = Math.round(km({ lat, lon }, near));
  const base = {
    id: `pin-${key}`,
    name: `Pinned farm (${lat.toFixed(2)}° N, ${lon.toFixed(2)}° E)`,
    lat,
    lon,
    slope_pct: near.slope_pct,
    ndvi_dry_min: near.ndvi_dry_min,
    placeholders: ["slope_pct", "ndvi_dry_min"],
  };
  if (cache.has(key)) return { preset: cache.get(key)!, live: true };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 12000);
    const url =
      `https://power.larc.nasa.gov/api/temporal/monthly/point?parameters=${PARAMS}&community=AG` +
      `&latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}&start=2015&end=2024&format=JSON`;
    const body = await (await fetch(url, { signal: ctl.signal })).json();
    clearTimeout(timer);
    const p = body.properties.parameter as Record<string, Record<string, number>>;
    const fill = body.header?.fill_value ?? -999;
    const vals = (param: string, m: number) =>
      YEARS.map((y) => p[param][`${y}${String(m).padStart(2, "0")}`]).filter((v) => v !== undefined && v !== fill);
    const season = (months: number[], label: string): SeasonClimate => {
      const monthly = months.map((m) => +(mean(vals("PRECTOTCORR", m)) * daysIn(m)).toFixed(1));
      const t2m = mean(months.map((m) => mean(vals("T2M", m))));
      const allsky = mean(months.map((m) => mean(vals("ALLSKY_SFC_SW_DWN", m))));
      return {
        label,
        rain_mm: +monthly.reduce((a, b) => a + b, 0).toFixed(1),
        monthly_rain_mm: monthly,
        t2m_c: +t2m.toFixed(2),
        tmax_c: +mean(months.map((m) => mean(vals("T2M_MAX", m)))).toFixed(2),
        allsky_mj: +allsky.toFixed(2),
        gwetroot: +mean(months.map((m) => mean(vals("GWETROOT", m)))).toFixed(3),
        et0_mm_day: +(0.0135 * (t2m + 17.8) * 0.408 * allsky).toFixed(2),
      };
    };
    const dry = season(DRY, "Dec–May");
    const k16 = ["201512", "201601", "201602", "201603", "201604", "201605"];
    const rain16 = k16.reduce((a, k) => a + (p.PRECTOTCORR[k] ?? 0) * daysIn(Number(k.slice(4))), 0);
    const preset: Preset = {
      ...base,
      seasons: { wet: season(WET, "Jun–Nov"), dry },
      elnino_2016_dry_rain_pct: +((rain16 / dry.rain_mm - 1) * 100).toFixed(1),
      source: "NASA POWER monthly API (live), community AG, 2015–2024",
    };
    if (!Number.isFinite(dry.rain_mm) || !Number.isFinite(dry.tmax_c)) throw new Error("bad data");
    cache.set(key, preset);
    return { preset, live: true };
  } catch {
    // Offline or the API is down: borrow the nearest preset's climate, and say so.
    return {
      preset: { ...base, seasons: near.seasons, elnino_2016_dry_rain_pct: near.elnino_2016_dry_rain_pct, source: `Nearest preset (${near.name}, ${distance} km): live NASA POWER unavailable` },
      live: false,
    };
  }
}
