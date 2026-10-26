# Music licence: `public/music/yokai-hour.mp3`

| Field | Value |
|---|---|
| Provider | ElevenLabs, Eleven Music API (`POST /v1/music`) |
| Plan | Starter or higher (lists "Commercial License for Speech and Music") |
| Date | 2026-10-26 |
| Song ID | `mLv6a7noDvO06SPK0juT` |
| Request | 60,000 ms, `force_instrumental: true`; prompt in `scripts/gen_music.py` |
| Checks | Automated QC (Qwen Omni): instrumental, no vocals. Loudness normalised to about −21 LUFS |
| Use | Looping background bed during "Yokai hour" night mode; ducked to 30% while narration plays |

Suggested credit: *Music generated with ElevenLabs Eleven Music.*

Other AI-generated elements in this app:
- Story-card illustrations and goshuin stamps: Duomi GPT Image 2.5 (`scripts/gen_art.py`)
- English narration: ElevenLabs `eleven_multilingual_v2`, voice "Brian" (`scripts/gen_narration.py`)
- Japanese narration: Google Gemini 3.8 Flash TTS via OpenRouter, voice "Charon"
