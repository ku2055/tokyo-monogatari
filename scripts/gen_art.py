"""Generate AI artwork per legend with Duomi GPT Image 2.5 (0.06 CNY per image).

  --kind art    ukiyo-e illustration for the story card  -> public/art/<id>.webp
  --kind stamp  goshuin-style vermilion seal for the stamp book -> public/stamps/<id>.webp

Keys are never stored in this repo: the client comes from ai-api-lab and reads the key from
the OS secret store (env var / macOS Keychain / `pass`).

    AIAPI_LAB=../ai-api-lab python3 scripts/gen_art.py --kind art|stamp [--only id1,id2] [--force]

Raw downloads go to .cache/ (git-ignored).
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
from aiapi.duomi import DuomiClient  # noqa: E402

STYLE = (
    "Traditional Japanese ukiyo-e woodblock print in the style of Hokusai and Hiroshige, "
    "muted indigo, vermilion and washi-paper tones, visible wood grain texture, flat colours, "
    "elegant composition, no text, no letters, no signature, no seal, no watermark."
)


STAMP_STYLE = (
    "A single Japanese goshuin temple seal stamp, vermilion red ink only on a pure white background, "
    "bold carved hanko linework with slightly uneven ink texture, circular or square border, centred, "
    "flat graphic, no other colours, no text, no letters, no kanji."
)


def prompt_for(legend, kind):
    spirit = f" featuring {legend['yokai']}" if legend.get("yokai") else ""
    if kind == "stamp":
        return f"Motif: {legend['emoji']} {legend['name']}{spirit}. {STAMP_STYLE}"
    return f"{legend['name']} in Tokyo{spirit}. Scene: {legend['legend']} {STYLE}"


KINDS = {
    "art": {"dir": "art", "size": "1536x1024", "width": 640},
    "stamp": {"dir": "stamps", "size": "1024x1024", "width": 360},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--kind", choices=KINDS, default="art")
    ap.add_argument("--only", help="comma-separated legend ids")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    legends = json.loads((ROOT / "data/legends.json").read_text())
    if args.only:
        wanted = set(args.only.split(","))
        legends = [l for l in legends if l["id"] in wanted]

    kind = KINDS[args.kind]
    out_dir, cache = ROOT / "public" / kind["dir"], ROOT / ".cache" / kind["dir"]
    out_dir.mkdir(parents=True, exist_ok=True)
    cache.mkdir(parents=True, exist_ok=True)
    client = DuomiClient()

    for legend in legends:
        out = out_dir / f"{legend['id']}.webp"
        if out.exists() and not args.force:
            continue
        print(f"→ {legend['id']}", flush=True)
        try:
            tid = client.image_create(prompt_for(legend, args.kind), model="gpt-image-2.5-flare", size=kind["size"])
            print(f"  task {tid}", flush=True)  # logged so a timed-out task can still be collected later
            # Duomi's queue can take well over 10 minutes when busy
            task = client.wait(tid, client.image_task, poll=8, timeout=1800)
            url = task["data"]["images"][0]["url"]
        except Exception as e:  # report and move on; never retry blindly (costs money)
            print(f"  failed: {e}", flush=True)
            continue
        raw = cache / f"{legend['id']}.png"
        client.save(url, str(raw))
        subprocess.run(
            ["ffmpeg", "-loglevel", "error", "-y", "-i", str(raw), "-vf", f"scale={kind['width']}:-2", "-quality", "78", str(out)],
            check=True,
        )
        time.sleep(2)  # Duomi rate limit: about 1 request/second


if __name__ == "__main__":
    main()
