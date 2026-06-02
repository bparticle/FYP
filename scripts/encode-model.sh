#!/usr/bin/env bash
# Compress raw/FYP_TRIPTYCH.glb into a web-ready public/models/fyp-triptych.glb.
# Uses @gltf-transform/cli (run via npx — no install needed).
#
# Pipeline: resize the two 5021x5021 art textures -> 2048, then re-encode WebP.
# Textures are ~99% of the weight (6 MB -> ~750 KB from the resize alone).
#
# We deliberately do NOT geometry-compress (meshopt / quantize / optimize):
# those steps re-center each mesh and bake a compensating node transform, which
# moves the wing node origins OFF their hinges and breaks the fold (the page
# folds the wings by rotating the LEFTCARD / RIGHTCARD nodes, whose origins must
# stay on the hinges). Texture resize keeps the geometry + node origins intact.
#
# Usage (from repo root):
#   ./scripts/encode-model.sh
#
# Behind a TLS-intercepting proxy, npx may fail to fetch the package. Either
# pre-install it, or export your corporate CA, e.g.:
#   export NODE_EXTRA_CA_CERTS=/path/to/corp-ca.pem

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/raw/FYP_TRIPTYCH.glb"
OUT="$ROOT/public/models/fyp-triptych.glb"
TMP="$(mktemp -d)"
GT="npx --yes @gltf-transform/cli"
TEX=2048
QUALITY=95   # art is high-contrast line work; low q washes blacks

trap 'rm -rf "$TMP"' EXIT

command -v npx >/dev/null 2>&1 || { echo "npx (Node.js) not found on PATH." >&2; exit 1; }
[[ -f "$SRC" ]] || { echo "Missing $SRC" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"

echo "1/2  resize textures -> ${TEX}px ..."
$GT resize "$SRC" "$TMP/r.glb" --width "$TEX" --height "$TEX"

echo "2/2  re-encode textures -> WebP q${QUALITY} ..."
$GT webp "$TMP/r.glb" "$OUT" --quality "$QUALITY"

echo "Done. $SRC -> $OUT"
ls -la "$OUT"

echo "Checking node names (LEFTCARD / RIGHTCARD must be present) ..."
node "$(dirname "$0")/check-model.mjs" "$OUT"
