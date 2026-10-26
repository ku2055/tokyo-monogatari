"""Record a storyteller narration of every legend: English with ElevenLabs, Japanese with Gemini TTS.

Japanese uses Gemini (via OpenRouter) because ElevenLabs' premade voices misread kanji
(QC: 首 read as 手, naturalness 3/10) while Gemini scored 9/10.

Keys are never stored in this repo: the client comes from ai-api-lab and reads the key from
the OS secret store (env var / macOS Keychain / `pass`).

    AIAPI_LAB=../ai-api-lab python3 scripts/gen_narration.py [--lang en|ja] [--only id1,id2] [--force]

Writes public/audio/<lang>/<id>.mp3 (22 kHz, 32 kbps: small enough to ship in the app).
"""
import argparse
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, os.environ.get("AIAPI_LAB", str(ROOT.parent / "ai-api-lab")))
from aiapi.elevenlabs import ElevenLabsClient  # noqa: E402
from aiapi.openrouter import OpenRouterClient  # noqa: E402

VOICE_EN = "brian"  # ElevenLabs deep narration voice; pick by ear with ai-api-lab/scripts/audition_voices.py
VOICE_JA = "Charon"  # Gemini TTS voice
CACHE = ROOT / ".cache/tts"


def synthesise(lang, text, out, eleven, openrouter):
    if lang == "en":
        out.write_bytes(eleven.tts(text, voice=VOICE_EN, model_id="eleven_multilingual_v2", output_format="mp3_22050_32"))
        return
    audio, ext, _ = openrouter.speech_audio("google/gemini-3.8-flash-tts", text, VOICE_JA)
    CACHE.mkdir(parents=True, exist_ok=True)
    raw = CACHE / f"{out.stem}.{ext}"
    raw.write_bytes(audio)
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-ar", "22050", "-ac", "1", "-b:a", "32k", str(out)],
        check=True,
    )


def script_for(legend, lang):
    # Framed like a rakugo storyteller opening the tale at the very spot
    if lang == "ja":
        return f"さて、お立ち会い。ここ、{legend['nameJa']}に伝わる物語でございます。{legend['legendJa']}"
    return f"Gather round, traveller. You are standing at {legend['name']}, and this is its tale. {legend['legend']}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lang", choices=["en", "ja"], action="append")
    ap.add_argument("--only", help="comma-separated legend ids")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    legends = json.loads((ROOT / "data/legends.json").read_text())
    if args.only:
        wanted = set(args.only.split(","))
        legends = [l for l in legends if l["id"] in wanted]

    eleven, openrouter = ElevenLabsClient(), OpenRouterClient()
    chars = 0
    for lang in args.lang or ["en", "ja"]:
        out_dir = ROOT / "public/audio" / lang
        out_dir.mkdir(parents=True, exist_ok=True)
        for legend in legends:
            out = out_dir / f"{legend['id']}.mp3"
            if out.exists() and not args.force:
                continue
            text = script_for(legend, lang)
            print(f"→ {lang}/{legend['id']} ({len(text)} chars)", flush=True)
            try:
                synthesise(lang, text, out, eleven, openrouter)
            except Exception as e:  # report and move on; never retry blindly (costs credits)
                print(f"  failed: {e}", flush=True)
                continue
            chars += len(text)
            time.sleep(0.5)
    print(f"done: {chars} characters synthesised")


if __name__ == "__main__":
    main()
