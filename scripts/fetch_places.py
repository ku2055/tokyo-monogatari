"""Bake every shrine and temple in Tokyo's 23 wards from OpenStreetMap (Overpass) into data/places.geojson.

Data © OpenStreetMap contributors, ODbL. No key needed. Re-run to refresh:

    python3 scripts/fetch_places.py
"""
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# Rough bounding box of the 23 special wards (south, west, north, east)
BBOX = "35.52,139.56,35.82,139.92"
QUERY = f"""
[out:json][timeout:120];
(
  nwr["amenity"="place_of_worship"]["religion"~"^(shinto|buddhist)$"]({BBOX});
);
out center tags;
"""


def main():
    req = urllib.request.Request(
        "https://overpass-api.de/api/interpreter",
        data=urllib.parse.urlencode({"data": QUERY}).encode(),
        headers={"User-Agent": "tokyo-monogatari-hackathon/0.1"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        elements = json.load(r)["elements"]

    features = []
    for el in elements:
        tags = el.get("tags", {})
        lat = el.get("lat") or el.get("center", {}).get("lat")
        lon = el.get("lon") or el.get("center", {}).get("lon")
        name = tags.get("name")
        if lat is None or not name:
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [round(lon, 5), round(lat, 5)]},
            "properties": {
                "name": name,
                "nameEn": tags.get("name:en"),
                "religion": tags["religion"],
                "osm": f"{el['type']}/{el['id']}",
            },
        })
    out = {
        "type": "FeatureCollection",
        "attribution": "© OpenStreetMap contributors, ODbL 1.0",
        "features": features,
    }
    path = ROOT / "data/places.geojson"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(features)} places → {path} ({path.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
