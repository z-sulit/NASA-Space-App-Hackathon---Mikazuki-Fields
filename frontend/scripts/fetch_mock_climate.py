"""Build frontend/src/data/presets.json from the NASA POWER monthly API.

Stand-in for Person 1's data-prep presets so the UI draft shows real NASA
numbers. Slope and NDVI are placeholders until the SRTM / MODIS pulls land.

Usage (from the repo root):  python frontend/scripts/fetch_mock_climate.py
"""
import json
import urllib.request
from calendar import monthrange
from pathlib import Path

PARAMS = "T2M,T2M_MAX,PRECTOTCORR,GWETROOT,ALLSKY_SFC_SW_DWN"
YEARS = range(2015, 2025)
WET = [6, 7, 8, 9, 10, 11]
DRY = [12, 1, 2, 3, 4, 5]

PRESETS = [
    # id, name, lat, lon, placeholder slope %, placeholder dry-season NDVI
    ("bukidnon", "Bukidnon (near Valencia City)", 7.90, 125.09, 12.0, 0.42),
    ("davao_del_sur", "Davao del Sur (near Digos)", 6.75, 125.36, 6.0, 0.55),
    ("isabela", "Isabela (near Ilagan)", 17.15, 121.89, 3.0, 0.31),
]


def fetch(lat, lon):
    url = (
        "https://power.larc.nasa.gov/api/temporal/monthly/point"
        f"?parameters={PARAMS}&community=AG&latitude={lat}&longitude={lon}"
        f"&start={YEARS[0]}&end={YEARS[-1]}&format=JSON"
    )
    with urllib.request.urlopen(url, timeout=60) as r:
        body = json.load(r)
    fill = body.get("header", {}).get("fill_value", -999)
    return body["properties"]["parameter"], fill


def month_values(param, fill, month):
    """All valid yearly values for a calendar month (skips the annual '13' key)."""
    vals = []
    for y in YEARS:
        v = param.get(f"{y}{month:02d}")
        if v is not None and v != fill:
            vals.append(v)
    return vals


def mean(xs):
    return sum(xs) / len(xs)


def et0(t2m, allsky):
    """Hargreaves radiation form, mm/day (ALLSKY in MJ/m2/day)."""
    return 0.0135 * (t2m + 17.8) * 0.408 * allsky


def season(p, fill, months):
    rain_by_month = []
    for m in months:
        mm_per_day = mean(month_values(p["PRECTOTCORR"], fill, m))
        rain_by_month.append(round(mm_per_day * monthrange(2021, m)[1], 1))
    t2m = mean([mean(month_values(p["T2M"], fill, m)) for m in months])
    tmax = mean([mean(month_values(p["T2M_MAX"], fill, m)) for m in months])
    allsky = mean([mean(month_values(p["ALLSKY_SFC_SW_DWN"], fill, m)) for m in months])
    gwet = mean([mean(month_values(p["GWETROOT"], fill, m)) for m in months])
    return {
        "rain_mm": round(sum(rain_by_month), 1),
        "monthly_rain_mm": rain_by_month,
        "t2m_c": round(t2m, 2),
        "tmax_c": round(tmax, 2),
        "allsky_mj": round(allsky, 2),
        "gwetroot": round(gwet, 3),
        "et0_mm_day": round(et0(t2m, allsky), 2),
    }


def dry_2016_rain_pct(p, fill, normal_rain):
    """Dec 2015 - May 2016 rain vs the 10-year dry-season normal (strong El Nino year)."""
    keys = ["201512", "201601", "201602", "201603", "201604", "201605"]
    total = 0.0
    for k in keys:
        v = p["PRECTOTCORR"][k]
        if v == fill:
            return None
        total += v * monthrange(int(k[:4]), int(k[4:]))[1]
    return round((total / normal_rain - 1) * 100, 1)


def main():
    out = []
    for pid, name, lat, lon, slope, ndvi in PRESETS:
        p, fill = fetch(lat, lon)
        wet, dry = season(p, fill, WET), season(p, fill, DRY)
        out.append({
            "id": pid,
            "name": name,
            "lat": lat,
            "lon": lon,
            "seasons": {"wet": {"label": "Jun–Nov", **wet}, "dry": {"label": "Dec–May", **dry}},
            "elnino_2016_dry_rain_pct": dry_2016_rain_pct(p, fill, dry["rain_mm"]),
            "slope_pct": slope,
            "ndvi_dry_min": ndvi,
            "placeholders": ["slope_pct", "ndvi_dry_min"],
            "source": f"NASA POWER monthly API, community AG, {YEARS[0]}–{YEARS[-1]}",
        })
    dest = Path(__file__).resolve().parents[1] / "src" / "data" / "presets.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {dest}")
    for o in out:
        w, d = o["seasons"]["wet"], o["seasons"]["dry"]
        print(o["id"], "wet", w["rain_mm"], "mm", w["tmax_c"], "C", "| dry", d["rain_mm"], "mm", d["tmax_c"], "C",
              "gwet", d["gwetroot"], "| 2016 dry", o["elnino_2016_dry_rain_pct"], "%")


if __name__ == "__main__":
    main()
