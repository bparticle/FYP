#!/usr/bin/env bash
# Re-encode raw/ sources into public/media/ for the static site.
# Requires ffmpeg on PATH.
#
# Usage (from repo root):
#   ./scripts/encode-media.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RAW="$ROOT/raw"
OUT="$ROOT/public/media"

require_ffmpeg() {
  command -v ffmpeg >/dev/null 2>&1 || {
    echo "ffmpeg not found on PATH. Install it and try again." >&2
    exit 1
  }
}

encode_mp4() {
  local input="$1" output="$2" size="$3" crf="${4:-28}"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$input" \
    -an \
    -vf "scale=${size}:${size}:flags=lanczos" \
    -c:v libx264 -crf "$crf" -preset slow -pix_fmt yuv420p \
    -movflags +faststart \
    "$output"
}

encode_webm() {
  local input="$1" output="$2" size="$3" crf="${4:-35}"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$input" \
    -an \
    -vf "scale=${size}:${size}:flags=lanczos" \
    -c:v libvpx-vp9 -crf "$crf" -b:v 0 -row-mt 1 \
    "$output"
}

encode_poster() {
  local input="$1" output="$2" size="$3" at="$4"
  ffmpeg -hide_banner -loglevel error -y \
    -ss "$at" \
    -i "$input" \
    -vf "scale=${size}:${size}:flags=lanczos" \
    -frames:v 1 -q:v 2 \
    "$output"
}

require_ffmpeg
mkdir -p "$OUT"

encode_static1() {
  local input="$RAW/FYP_static1.mp4"
  [[ -f "$input" ]] || { echo "Missing $input" >&2; exit 1; }
  echo "Encoding FYP_static1.mp4 ..."
  encode_mp4 "$input" "$OUT/fyp-static1-web.mp4" 1280
  encode_webm "$input" "$OUT/fyp-static1-web.webm" 1280
  encode_poster "$input" "$OUT/fyp-poster.jpg" 1280 1
}

encode_companion1() {
  local input="$RAW/FYP_1.mp4"
  [[ -f "$input" ]] || { echo "Missing $input" >&2; exit 1; }
  echo "Encoding FYP_1.mp4 ..."
  encode_mp4 "$input" "$OUT/fyp-1-web.mp4" 900
  encode_poster "$input" "$OUT/fyp-1-poster.jpg" 900 1
}

encode_companion2() {
  local input="$RAW/FYP_2.mp4"
  [[ -f "$input" ]] || { echo "Missing $input" >&2; exit 1; }
  echo "Encoding FYP_2.mp4 ..."
  encode_mp4 "$input" "$OUT/fyp-2-web.mp4" 900
  encode_poster "$input" "$OUT/fyp-2-poster.jpg" 900 0.5
}

encode_static1
encode_companion1
encode_companion2

echo "Done. Outputs written to public/media/"
