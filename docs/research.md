# Tokyo Monogatari: inspiration and open resources (researched 2026-10-26)

Verified live today unless marked "unverified". Wikidata/Overpass counts are real query results.

## A) GitHub / open-source

| Project | What | License | Keys | Use for us |
|---|---|---|---|---|
| maplibre/awesome-maplibre (cloned) | Curated MapLibre plugins/tools/examples | BSD-3 | no | Find scrollytelling, 3D, markers, PMTiles plugins |
| ponkotuy/train-stamp-rally (cloned) | Train stamp rally app, Apache-2.0, small | Apache-2.0 | no | Data model for stamps, check-in rules, rally progress |
| VTuber-Rally/stamp-rally-app (cloned) | Japan Expo stamp rally client | MIT | no | Stamp-collection UI and state flow |
| benjaminjonard/goshuin (cloned) | Self-hosted goshuin/stamp collection manager | MIT | no | Goshuin entity schema (place, date, image, notes) |
| mapbox/storytelling (BSD-3, 680 stars, 119MB, not cloned) | Chapter-based scrollytelling; swap mapbox-gl for maplibre-gl | BSD-3 | no with MapLibre | Story mode: one chapter per folktale with flyTo |
| ONSvisual/income-scrolly | Scrollytelling already on MapLibre | none stated (inspiration only) | no | Reference for scroll+MapLibre wiring |
| rois-codh/kaokore | Faces dataset from Japanese art (ROIS-DS CODH) | check repo (CC BY) | no | Yokai/character portrait source, quick sprites |
| geolonia/japanese-addresses | Town-level JP address + lat/lng | MIT | no | Offline reverse "which town am I in" labels |
| gsi-cyberjapan/optimal_bvmap | GSI optimized vector tiles | per GSI terms | no | Alternate JP basemap |
| Map Warper (Japanese instance, mapwarper.h-gis.jp) | Georeferenced old-map tiles used by CODH Edo Maps | open code, tile terms per map | no | Edo kiriezu raster overlay |

Gaps: no mature open-source "Pokemon GO-like" or kaidan map app was found by GitHub search. Searches for Edo-map and Tokyo hackathon winners returned only toy repos. Build the game loop ourselves.

## B) Nonprofit / public / open data

| Source | Offers | License | Key? | Concrete use |
|---|---|---|---|---|
| OpenStreetMap / Overpass | 4,296 shinto+buddhist places of worship in Tokyo (2,650 nodes, 1,620 ways, 26 relations; live query) | ODbL (credit OSM) | no | Base POI layer, fills Wikidata gaps |
| OpenFreeMap | Vector tiles, MapLibre styles | OSM data + free | no | Basemap (already planned) |
| Wikidata SPARQL | Shrines (Q845945) 712 in Tokyo, 692 with image; Buddhist temples (Q5393308) 2,595, 2,520 with image (P131 chain to Q1490) | CC0 | no (set User-Agent) | Names EN/JA, coordinates, Commons photos, descriptions |
| Wikimedia Commons | Photos of the Wikidata items | CC BY/CC BY-SA/PD per file | no | Place cards (show attribution) |
| CODH Edo Maps (codh.rois.ac.jp/edo-maps) | 29 Owariya kiriezu, ~8.7k georeferenced place names; 2025 release | CC BY-SA 4.0 (page); check per dataset | no | Old-Edo overlay toggle, "this shrine in 1860" |
| CODH / Japan Search | Yokai/ukiyo-e collections, IIIF | per item (many PD or CC) | no | Yokai art |
| Japan Search API (jpsearch.go.jp/api) | Cross-search across JP museums; query for 画図百鬼夜行 returned 37 hits; rights facets (pdm/ccby/cc0) | per item | no | Filter rights=pdm for yokai images |
| NDL Search OpenSearch / NDL Digital | Metadata API works (no key); public-domain 画図百鬼夜行 scans; IIIF at dl.ndl.go.jp (root returned 403, use per-item manifests) | PD for old works; check item | no | Toriyama Sekien yokai art |
| Tokyo Open Data Catalog (CKAN) | catalog.data.metro.tokyo.lg.jp API; search 文化財 gave 73 datasets | mostly CC BY | no | Official cultural property lists, join to POIs |
| Art Institute of Chicago API | api.artic.edu; "ukiyo-e" 133,169 matches | CC0 for public domain items | no | Ukiyo-e backdrops |
| The Met Open Access | Search endpoint v1 retired 2026-10-01; use /v1.1/search (my test of yokai returned 0) | CC0 | no | Hokusai/Hiroshige prints |
| Project PLATEAU (MLIT) | 3D city models | CC BY 4.0 (check) | no | Already cloned; night skyline |
| ODPT | Transit data | ODPT terms | token | Skipped, needs token |
| Code for Japan | Civic tech community and datasets | varies | no | Hackathon contacts, datasets |

## Top 5 "steal this idea"
1. Chapter scrollytelling per folktale (mapbox/storytelling, BSD-3, swap in MapLibre): flyTo each yokai site.
2. Stamp rally state machine: ponkotuy/train-stamp-rally (Apache-2.0).
3. Goshuin collection as a data model with image, date and note: benjaminjonard/goshuin (MIT).
4. Old/new split: Edo kiriezu overlay slider from CODH Edo Maps and Map Warper tiles.
5. Yokai hour: night style plus Sekien yokai art appearing near shrines after dusk.

## Top 5 "use this data"
1. Wikidata SPARQL, CC0, https://query.wikidata.org/sparql: ~3.3k shrines and temples with coordinates, mostly with images.
2. OSM via Overpass, ODbL, https://overpass-api.de: 4,296 worship sites for coverage.
3. Japan Search API, rights per item, https://jpsearch.go.jp/api/item/search/jps-cross?keyword=...: filter public-domain yokai art.
4. CODH Edo Maps, CC BY-SA 4.0, https://codh.rois.ac.jp/edo-maps/: historical place names and overlay.
5. Tokyo Open Data CKAN, CC BY, https://catalog.data.metro.tokyo.lg.jp/api/3/action/package_search?q=文化財: official cultural property lists.

Runners-up: AIC API (CC0), NDL Search, Met v1.1 (CC0).

## Caveats
- The Wikidata query with label service and P131* timed out (502). Use a plain query and fetch labels separately. Types: Q5393308 is Buddhist temple. Q160742 (abbey) is the wrong class.
- CODH, NDL and Map Warper licenses and tile endpoints were not individually verified; check each dataset page before shipping.
- I did not clone mapbox/storytelling (119MB). jakobzhao/storytelling expanded to 113MB on disk and was removed.
