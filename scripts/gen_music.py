"""Compose the "yokai hour" background loop with ElevenLabs Eleven Music (about 750 credits per minute).

Public asset, so ElevenLabs (commercial licence) rather than Suno. The key comes from the OS secret
store via ai-api-lab and never touches this repo.

    AIAPI_LAB=../ai-api-lab python3 scripts/gen_music.py

Writes public/music/yokai-hour.mp3 and prints the song id for music_license.md.
"""
import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, os.environ.get("AIAPI_LAB", str(ROOT.parent / "ai-api-lab")))
from aiapi.keychain import elevenlabs_key  # noqa: E402

PROMPT = (
    "Eerie, slow traditional Japanese night ambience for a ghost-story map: sparse shakuhachi flute, "
    "soft plucked koto, distant temple bell, low taiko pulse, wind through bamboo, mysterious but gentle, "
    "seamless loop, no vocals."
)
LENGTH_MS = 60000


def main():
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128",
        data=json.dumps({"prompt": PROMPT, "music_length_ms": LENGTH_MS, "force_instrumental": True}).encode(),
        headers={"xi-api-key": elevenlabs_key(), "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=180) as r:
        audio, song_id = r.read(), r.headers.get("song-id")
    raw = ROOT / ".cache/yokai-hour-raw.mp3"
    raw.parent.mkdir(parents=True, exist_ok=True)
    raw.write_bytes(audio)
    out = ROOT / "public/music/yokai-hour.mp3"
    out.parent.mkdir(parents=True, exist_ok=True)
    # Background bed: normalise quietly and shrink for the web
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-af", "loudnorm=I=-20:TP=-2",
         "-ar", "44100", "-b:a", "96k", str(out)],
        check=True,
    )
    print(f"song-id: {song_id}  →  {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
