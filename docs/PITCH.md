# Pitch: 東京物語 Tokyo Monogatari

> **The city has a memory, and it's full of ghosts.** Tokyo Monogatari turns the 27 places where Edo's legends happened into a walking stamp rally. A storyteller tells each tale where it took place, and you collect a seal and a photo to prove you were there.

## Why it fits the brief

| Brief criterion | How we meet it |
|---|---|
| **Only possible in Tokyo** | Every legend is pinned to its real site: Masakado's head mound among Otemachi office towers, Oiwa's shrine in Yotsuya, the Oji fox procession, the Nopperabo slope at Akasaka. The stamp only unlocks within 150 m. |
| **Only possible with AI** | AI made the content layer: an ukiyo-e illustration and a hanko seal for every site, storyteller narration in English and Japanese, and a yokai-hour soundtrack. A human team couldn't produce that much in a day. |
| **Field rule** | Players have to walk to each site to collect its stamp, then add their own field photo to the 御朱印帳. |
| **Shared base ("Tokyo Graph")** | `data/places.geojson` holds all 3,185 OSM shrines and temples in the 23 wards. `data/legends.json` holds 27 curated, sourced, bilingual legends. Other teams can reuse both. |
| **Demo in Japanese** | One tap switches the whole app, including the narration, to 日本語. |
| **Tracks** | READ (tales tied to coordinates), HEAR (narration and soundscape), STAND (3D city with Edo history underfoot) |

**Why not just another shrine map?** Goshuin apps already exist (Goshuin Atlas, 神社がいいね). They're lists. Ours is a storyteller: the AI layer is the product, and the map is the stage.

## v2: live AI lenses (the "wow")

- **👹 Yokai Lens.** Photograph any spot. Gemini reads the scene, GPS and nearest real legends, then invents a new yokai for that exact spot. Nano Banana paints it into the photo, and a rakugo-style kaidan is narrated in EN/JA. Every spirit joins the shared **Night Parade** map, so the team builds a new Tokyo bestiary during the hackathon.
- **⏳ Edo Window.** The same photo repainted as the same viewpoint around 1850, with "expressway → Benkei moat" mappings and narration.
- Demo moment: Kii-no-kuni-zaka. The AI saw the wooden slope marker and invented the "Face-Planing Tanuki", a nod to Hearn's Nopperabo. Its Edo Window independently matched Hiroshige's 1857 composition of the same slope.

## 2-minute demo script

1. **(0:00) Hook.** "Edo had a million people and a lot of ghosts. Most of them are still here." Open the app: a 3D Tokyo flies in, with 27 legend pins and 3,000 shrine dots.
2. **(0:20) Masakado's Kubizuka.** Tap 💀. The card shows the ukiyo-e scene. Tap 🎙️: "Gather round, traveller…" The head flew from Kyoto and landed here, and no developer has dared move it in 1,000 years.
3. **(0:50) Collect.** "In the real app you have to stand here." Tap ✨ teleport, then 🔴 collect. The hanko seal slams onto the screen, and you add the photo you took on our field walk.
4. **(1:10) 日本語.** Tap 日本. The card, the UI and the voice all switch to Japanese.
4b. **(1:15) 👹 Yokai Lens (live).** Take a photo of the room or street right now. While Gemini "consults the local legends", explain the pipeline. Reveal the yokai painted into the photo, drag the slider, and play the kaidan. Then open ⏳ Edo Window on a photo taken earlier on the field walk.
5. **(1:25) Yokai hour 🌙.** The city goes dark, the pins glow, and the shakuhachi soundtrack starts. Run 🎬 to fly the camera through the legends.
6. **(1:45) Stamp book 📖.** Collected seals and field photos. "27 legends. We collected N today. The base data is open for every team."

## What we built in the hackathon

- A mobile-first web app (Vite + MapLibre, OpenFreeMap 3D buildings). **No API keys at runtime.**
- An AI content pipeline (`scripts/`): Duomi GPT Image 2.5 for art and seals, ElevenLabs for English narration, Gemini TTS for Japanese, ElevenLabs Music for the soundtrack. Each output was QC'd by a second model.
- Open data: OSM Overpass extract and hand-verified legend coordinates with Wikipedia sources.
- iPhone-ready: it wraps in Capacitor on a Mac (`npx cap add ios`).

## Next steps

1. **Ask the storyteller.** Live Q&A with Claude, answering in character and grounded in `legends.json`, through a tiny serverless proxy so no key ships in the client.
2. **Edo overlay.** Add a CODH Edo Maps kiriezu slider (CC BY-SA) under the 3D city: "this shrine in 1860".
3. **More legends.** Wikidata has 3,300+ shrines and temples with images, and the Nichibunken Kaii-Yōkai DB has 35k records. An LLM-assisted curation pipeline could scale the legend set.
4. **Live trains.** Show "ride to the next legend" using Mini Tokyo 3D's plugin API once ODPT keys are approved.
