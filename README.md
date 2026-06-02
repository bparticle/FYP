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
scene3d.js              — the scroll-driven 3D triptych (Three.js + GSAP)
scripts/encode-media.*  — ffmpeg pipeline (raw → public/media)
scripts/encode-model.*  — gltf-transform pipeline (raw → public/models)
public/media/           — web-compressed videos and posters
public/models/          — web-compressed 3D model (.glb)
public/vendor/          — pinned local copies of Three.js + GSAP (no CDN)
raw/                    — source mp4s + the master .glb (not served)
```

The page uses **relative paths only**, no build step, no analytics, and **no
runtime external dependencies** — Three.js and GSAP are vendored under
`public/vendor/` and loaded via a relative-path import map, so the site works
fully offline.

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

## The 3D object

Just below the hero, the physical triptych appears as a real interactive 3D
model (`scene3d.js`). It loads **folded shut**, becomes sticky, and **scroll
scrubs it open** — the right wing first, then the left once the right is ~170°
open. While idle it floats gently and leans toward the cursor; once fully open
the sticky releases and the page scrolls on. It degrades to the still
`fyp-object-open` image under `prefers-reduced-motion`, the motion toggle, a
WebGL-less browser, or JS off.

**The model.** Master art is `raw/FYP_TRIPTYCH.glb` (Blender export, ~6 MB, two
5021×5021 textures). The five nodes are authored so each wing's origin sits
exactly on its hinge and the hinge rods run along local **Z** — so folding is
just rotating the `LEFTCARD` / `RIGHTCARD` nodes around their own Z; the center
panel and the two hinges stay put. Tunable angles/orientation live at the top of
`scene3d.js` (`CFG`).

**Compression** (`scripts/encode-model.*`, needs Node + `npx`): the two
5021×5021 textures are resized to 2048px and re-encoded WebP — ~99% of the
weight, so 6 MB → ~0.75 MB. Geometry is left untouched on purpose: meshopt /
quantization re-centers each mesh and bakes a compensating node transform,
which moves the wing origins **off their hinges** and breaks the fold. Re-run
after replacing the master:

```powershell
# Windows (from repo root)
powershell -ExecutionPolicy Bypass -File .\scripts\encode-model.ps1
```
```bash
# macOS / Linux / Git Bash
./scripts/encode-model.sh
```

**Libraries.** `public/vendor/` holds pinned copies of Three.js (`three.module.js`
+ the `GLTFLoader`, meshopt decoder, and `RoomEnvironment` addons) and GSAP
(`gsap.min.js` + `ScrollTrigger.min.js`). To update, install the same versions
locally and copy the matching build files — no CDN is referenced at runtime.

## Design notes

- **Palette is drawn from the actual art**, not the default anti-design tokens:
  blush `#F7D9D2`, ink `#050505`, off-white `#FFFDFC`, cool grey `#C8C8C3`,
  magenta `#ED276C` / `#FF2D95`, lime `#AEEA00` / `#8ACE00`. Functional default
  link blue `#0000EE` is kept as the only anti-design accent.
- **Background** is a zoom-cropped still (`fyp-static.png`, from `raw/FYP_static.png`).
  A blush veil sits over it so foreground text stays legible.
- **Hard borders, hard 6px offset shadows, no rounded corners, no glassmorphism,
  no soft gradients.** Bimodal whitespace.
- **Companion 1/1s** each get their own colored panel — magenta for #1, lime
  for #2 — matching their actual backgrounds.
- **Floating feed fragments** drift around the background as deadpan
  surveillance/feed labels.

## Accessibility & responsive

- Respects `prefers-reduced-motion`: disables the triptych unfold animation and
  swaps panel videos for their poster images.
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
