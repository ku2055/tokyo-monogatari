# 東京物語 · Tokyo Monogatari

**Walk the legends of Tokyo.** A bilingual (English / 日本語) 3D map of Tokyo's temples, shrines and folk-tale sites. Travellers open a legend, read the story where it happened, and collect a 御朱印 (goshuin) style stamp when they're actually there.

Built for a Tokyo hackathon. **No API keys needed:** it runs entirely on open data.

## Features

- 🗾 **3D Tokyo**: tilted MapLibre map with extruded buildings (OpenStreetMap via OpenFreeMap)
- ⛩️ **Legends of Edo**: 27 hand-curated, sourced temples, shrines and folk-tale sites (Masakado's head mound, Oiwa Inari, Oji's fox procession, Oiteke-bori, the Nopperabo slope…)
- 🎨 **AI ukiyo-e art and seals**: a woodblock-style illustration and a unique hanko seal for every legend
- 🎙️ **Storyteller narration** in English and Japanese for every legend
- 🗺️ **3,185 shrines and temples** across the 23 wards from OpenStreetMap, as an open base layer
- 🔴 **Goshuin stamp rally**: get within 150 m of a site to collect its seal, add your own field photo, and track progress in the 御朱印帳 stamp book
- 🌙 **Yokai hour**: a night mode with an eerie shakuhachi-and-bell soundtrack
- 🎬 **Legend tour**: auto-flies the camera through every site (built for stage demos)
- ✨ **Demo teleport**: try collecting without being in Tokyo
- 🌐 **English / 日本語** toggle, which defaults to the device language

## Run it

```bash
npm install
npm run dev      # http://localhost:5173 (also exposed on your LAN for phone testing)
npm run build    # static site in dist/
```

Pushes to `main` deploy to GitHub Pages automatically (`.github/workflows/deploy.yml`).

## iPhone app (later, on a Mac)

The web app is mobile-first and ready to wrap with [Capacitor](https://capacitorjs.com) (`capacitor.config.json` is included):

```bash
npm install @capacitor/core @capacitor/cli @capacitor/ios
npm run build
npx cap add ios
npx cap sync ios
npx cap open ios   # opens Xcode → run on device/simulator
```

Add `NSLocationWhenInUseUsageDescription` to `ios/App/App/Info.plist` so the stamp rally can use location.

## Stack and data

| Layer | Source | Key? |
|---|---|---|
| Map renderer | [MapLibre GL JS](https://maplibre.org) | No |
| Basemap and 3D buildings | [OpenFreeMap](https://openfreemap.org) `liberty` style, © OpenStreetMap contributors | No |
| Legends | `data/legends.json`, hand-curated and bilingual, each entry links its source | No |
| Shrines and temples | `data/places.geojson`, from OSM Overpass (`scripts/fetch_places.py`), © OpenStreetMap contributors, ODbL | No |

## AI content pipeline

Everything AI-generated is **pre-rendered and committed**, so the app needs no keys and works offline-ish on stage. The scripts read keys at build time from the OS secret store (env var, macOS Keychain or `pass`) through our private `ai-api-lab` helper library (set `AIAPI_LAB` to its path). No key is ever written to this repo.

| Asset | Script | Model | Cost |
|---|---|---|---|
| Ukiyo-e card art (`public/art/`) | `scripts/gen_art.py --kind art` | Duomi GPT Image 2.5 | 0.06 CNY / image |
| Goshuin seals (`public/stamps/`) | `scripts/gen_art.py --kind stamp` | Duomi GPT Image 2.5 | 0.06 CNY / image |
| English narration (`public/audio/en/`) | `scripts/gen_narration.py` | ElevenLabs `eleven_multilingual_v2` | ~$0.08 / 1k chars |
| Japanese narration (`public/audio/ja/`) | `scripts/gen_narration.py` | Gemini 3.8 Flash TTS (via OpenRouter) | ~cents |
| Yokai-hour music (`public/music/`) | `scripts/gen_music.py` | ElevenLabs Eleven Music | ~750 credits / min |

Narration and music were checked by a second model (Qwen Omni). ElevenLabs' premade voices misread kanji in Japanese, so Japanese uses Gemini instead. Music licence: [`music_license.md`](music_license.md).

See [`docs/PITCH.md`](docs/PITCH.md) for the pitch and demo script, and [`docs/research.md`](docs/research.md) for the open-data and open-source research.

**Inspiration:** [Mini Tokyo 3D](https://github.com/nagix/mini-tokyo-3d) (real-time 3D Tokyo transit). It needs Mapbox and ODPT tokens, so we kept it as a design reference rather than a dependency. A natural next step is a "ride the train to the next legend" mode built on its plugin API.

## Roadmap ideas

- PLATEAU 3D city models for landmark buildings
- Ward boundaries: "conquer" a ward by collecting all its legends
- Walking routes between legends, plus seasonal festivals (matsuri)
- Ask the storyteller: live in-character Q&A grounded in `legends.json` (via a keyless serverless proxy)
- Edo kiriezu overlay from CODH Edo Maps

## License

MIT. Map data © OpenStreetMap contributors (ODbL).
