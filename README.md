# FYP — Sirius Crocodile genesis piece

Static one-page site for **FYP**, the genesis piece by Sirius Crocodile on Tezos.
Part of the official [Objkt One](https://objkt.one) curation, publicly shown at
[NFC Lisbon](https://www.nfclisbon.com) in June. Open edition with a physical
print raffle for holders, plus two companion 1/1s in the same body of work.

## Structure

```
index.html              — the page
style.css               — all styles (Functional Anti-Design, art-matched palette)
script.js               — motion toggle + easter egg
scripts/encode-media.*  — ffmpeg pipeline (raw → public/media)
public/media/           — web-compressed videos and posters
raw/                    — source mp4s (not used by the page)
```

The page uses **relative paths only** (`./public/media/...`), no build step, no
dependencies, no analytics.

## Run locally

Anything that serves the directory works. Examples:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just open `index.html` in a browser (video autoplay generally still works
because the videos are muted).

## Media encoding

There was no existing encode script — `scripts/encode-media.ps1` (Windows) and
`scripts/encode-media.sh` (macOS/Linux/Git Bash) now handle it. Both require
**ffmpeg** on your PATH.

**Source → output mapping**

| Raw file | Outputs in `public/media/` | Size |
|---|---|---|
| `FYP_static1.mp4` | `fyp-static1-web.mp4`, `fyp-static1-web.webm`, `fyp-poster.jpg` | 1280×1280 |
| `FYP_1.mp4` | `fyp-1-web.mp4`, `fyp-1-poster.jpg` | 900×900 |
| `FYP_2.mp4` | `fyp-2-web.mp4`, `fyp-2-poster.jpg` | 900×900 |

The hero loop gets both H.264 (broad support) and VP9 WebM (smaller where
supported). Companion pieces are MP4-only. Audio is stripped — every clip on
the page is muted. Posters are a single JPEG frame extracted from each source.

**Run it**

```powershell
# Windows (from repo root)
powershell -ExecutionPolicy Bypass -File .\scripts\encode-media.ps1
```

```bash
# macOS / Linux / Git Bash
chmod +x scripts/encode-media.sh   # once
./scripts/encode-media.sh
```

Encoding settings: H.264 CRF 28 (`slow` preset, `faststart` for streaming),
VP9 CRF 35 for WebM, Lanczos downscale. Re-run whenever you replace files in
`raw/` — outputs overwrite in place and the HTML paths stay the same.

## Design notes

- **Palette is drawn from the actual art**, not the default anti-design tokens:
  blush `#F7D9D2`, ink `#050505`, off-white `#FFFDFC`, cool grey `#C8C8C3`,
  magenta `#ED276C` / `#FF2D95`, lime `#AEEA00` / `#8ACE00`. Functional default
  link blue `#0000EE` is kept as the only anti-design accent.
- **Background** is a zoom-cropped autoplay of `fyp-static1-web.webm/.mp4`,
  muted, looping, with `playsinline`. A blush veil sits over it so foreground
  text stays legible.
- **Hard borders, hard 6px offset shadows, no rounded corners, no glassmorphism,
  no soft gradients.** Bimodal whitespace.
- **Companion 1/1s** each get their own colored panel — magenta for #1, lime
  for #2 — matching their actual backgrounds.
- **Floating feed fragments** drift around the background as deadpan
  surveillance/feed labels.

## Accessibility & responsive

- Respects `prefers-reduced-motion`: replaces the background video with the
  static poster, disables the marquee, swaps companion videos for their poster
  images.
- A persistent **"motion: on/off"** button (bottom-right) lets users toggle
  motion themselves; choice is stored in `localStorage`.
- All interactive targets are ≥ 44 px or padded to meet it.
- Logical DOM source order; visual chaos is CSS-only.
- All videos have `aria-label`; decorative fragments are `aria-hidden`.
- Reflows cleanly at 320, 768, 1280; no accidental horizontal scroll
  (`overflow-x: clip` on body and edge fragments hidden on narrow viewports).

## Easter egg

Type `fyp` anywhere on the page to briefly invert the world. It's additive —
nothing depends on finding it.

## External links

- [objkt.com](https://objkt.com) — the marketplace
- [objkt.one](https://objkt.one) — the curation
- [nfclisbon.com](https://www.nfclisbon.com) — the show
- [tezos.com](https://tezos.com) — the chain

No specific token contract is linked on purpose — canonical mint URLs live on
Objkt and on the artist's socials.
