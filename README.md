# 東京物語 · Tokyo Monogatari

**Walk the legends of Tokyo.** A bilingual (English / 日本語) 3D map of Tokyo's temples, shrines and folk-tale sites. Travellers open a legend, read the story where it happened, and collect a 御朱印 (goshuin) style stamp when they're actually there.

Built for a Tokyo hackathon. The map and stamp rally run on open data with **no API keys in the client**. The live AI lenses run on a Cloudflare Worker that holds the keys.

## ✨ Live AI lenses

| | 👹 **Yokai Lens** (百鬼夜行) | ⏳ **Edo Window** (時の窓) |
|---|---|---|
| You do | Photograph any spot in Tokyo | Photograph any view |
| The AI does | Reads the scene, your GPS, and the nearest real legends and shrines, then **invents a new yokai that haunts exactly that spot**. It paints the yokai into your photo and tells its kaidan like a rakugo storyteller (EN/JA) | Maps each modern thing it sees to its Edo counterpart (expressway → moat, asphalt → dirt slope) and **repaints your photo as the same viewpoint around 1850** in Hiroshige's woodblock style, with a narrated walk back in time |
| Then | Drag the before/after slider. Every spirit joins the shared **Night Parade** map | The same, with the "then and now" mappings listed |

Example from Kii-no-kuni-zaka, where Hearn's faceless Nopperabo appears: the AI spotted the wooden slope marker and conjured **削り顔狸, the "Face-Planing Tanuki"**, which planes travellers' faces smooth. Its Edo Window rebuilt the Kishū Tokugawa estate wall and the Benkei moat, matching Hiroshige's real 1857 print of the slope, which it was never shown.

Pipeline (`worker/src/index.js`): photo → R2 → **Gemini 3.8 Flash** (vision + lore → JSON story and edit instruction) → **Nano Banana 2.1** image edit (Duomi) → R2 → narration (**ElevenLabs** EN / **Gemini TTS** JA). About 0.08 CNY + $0.02 per spirit, roughly 60 seconds.

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

The lenses need the hackathon access code (ask the team), which the Worker checks. A daily cap limits spend.


```bash
npm install
npm run dev      # http://localhost:5173 (also exposed on your LAN for phone testing)
npm run build    # static site in dist/
```

Pushes to `main` deploy to GitHub Pages automatically (`.github/workflows/deploy.yml`).

### Worker (Cloudflare)

```bash
cd worker
wrangler r2 bucket create tokyo-monogatari
wrangler secret put OPENROUTER_KEY   # also DUOMI_KEY, ELEVENLABS_KEY, ACCESS_CODE: paste when prompted, never commit
wrangler deploy
```

Set `VITE_API` at build time to point the app at a different Worker.

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
