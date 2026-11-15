export interface Weather {
  tempC: number;
  rainMm: number;
  windKmh: number;
  /** Open-Meteo's own terrain height (90 m DEM), for when the backend's SRTM lookup is not reachable. */
  elevationM: number | null;
}

const cache = new Map<string, Promise<Weather | null>>();

/** Current weather at a point from Open-Meteo (free, no key, allows browser requests). Null when it cannot be reached. */
export function fetchWeather(lat: number, lon: number): Promise<Weather | null> {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&current=temperature_2m,precipitation,wind_speed_10m`, {
      signal: AbortSignal.timeout(6000),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((j: { elevation?: number; current: { temperature_2m: number; precipitation: number; wind_speed_10m: number } }) => {
        const c = j.current;
        if (![c.temperature_2m, c.precipitation, c.wind_speed_10m].every(Number.isFinite)) throw new Error("bad data");
        return { tempC: c.temperature_2m, rainMm: c.precipitation, windKmh: c.wind_speed_10m, elevationM: Number.isFinite(j.elevation) ? j.elevation! : null };
      })
      .catch(() => {
        cache.delete(key); // let a failed lookup be retried
        return null;
      });
    cache.set(key, hit);
  }
  return hit;
}
