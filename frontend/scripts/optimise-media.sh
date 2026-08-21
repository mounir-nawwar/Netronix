#!/usr/bin/env bash
# PERF-002 / PERF-004 — how the shipped media in `src/assets/optimised/` and
# `public/media/` was produced, so it can be reproduced or re-tuned rather than
# taken on trust.
#
# Everything here runs locally against files already in this repository. It
# contacts no service, uploads nothing, and needs only `ffmpeg` on PATH
# (6.1.1 was used). The source files it reads are the originals; the outputs
# are what the application imports.
#
#   ./scripts/optimise-media.sh
#
# Numbers recorded when this was last run are in
# `.local-audit/25_PHASE_4_STATUS.md`.

set -euo pipefail

cd "$(dirname "$0")/.."

SRC_VIDEO="src/assets/Videos/Razer AD.mp4"          # 1920×1080, 30.1 s, 11.5 MB
OUT_MEDIA="public/media"
OUT_IMG="src/assets/optimised"

mkdir -p "$OUT_MEDIA" "$OUT_IMG"

# ---------------------------------------------------------------------------
# Product video (PERF-002)
#
# Two-pass, because a single-pass CRF encode of a high-motion advertisement
# lands at 4.4 MB and the budget is ~1.5 MB. 1280×720 rather than 1080p: the
# element is `object-cover` inside a band that is never taller than the
# viewport, and 720p at this bitrate is visibly better than 1080p at the same
# one. Audio is kept — the element exposes `controls`, so a visitor can unmute
# — at 48 kbps mono, which is ~180 kB of the total.
#
# `+faststart` moves the moov atom to the front so playback can begin before
# the file has finished arriving.

video_h264() {
  ffmpeg -y -v warning -i "$SRC_VIDEO" -map 0:v:0 \
    -vf "scale=1280:-2" -c:v libx264 -profile:v high -preset slow \
    -b:v 340k -pass 1 -passlogfile /tmp/netronix-x264 -an -f mp4 /dev/null
  ffmpeg -y -v warning -i "$SRC_VIDEO" -map 0:v:0 -map 0:a:0 \
    -vf "scale=1280:-2" -c:v libx264 -profile:v high -preset slow \
    -b:v 340k -pass 2 -passlogfile /tmp/netronix-x264 \
    -pix_fmt yuv420p -movflags +faststart \
    -c:a aac -b:a 48k -ac 1 \
    "$OUT_MEDIA/netronix-product-video.mp4"
  rm -f /tmp/netronix-x264-0.log /tmp/netronix-x264-0.log.mbtree
}

video_vp9() {
  ffmpeg -y -v warning -i "$SRC_VIDEO" -map 0:v:0 \
    -vf "scale=1280:-2" -c:v libvpx-vp9 -b:v 300k -row-mt 1 -cpu-used 2 \
    -pass 1 -passlogfile /tmp/netronix-vp9 -an -f null /dev/null
  ffmpeg -y -v warning -i "$SRC_VIDEO" -map 0:v:0 -map 0:a:0 \
    -vf "scale=1280:-2" -c:v libvpx-vp9 -b:v 300k -row-mt 1 -cpu-used 2 \
    -pass 2 -passlogfile /tmp/netronix-vp9 -pix_fmt yuv420p \
    -c:a libopus -b:a 48k -ac 1 \
    "$OUT_MEDIA/netronix-product-video.webm"
  rm -f /tmp/netronix-vp9-0.log
}

# The poster is a real frame of the clip (t=3 s, the Cobra Pro product shot),
# not an invented image. JPEG rather than WebP purely so `poster=` needs no
# compatibility note.
video_poster() {
  ffmpeg -y -v error -ss 3 -i "$SRC_VIDEO" -frames:v 1 \
    -vf "scale=1280:-2" -q:v 6 "$OUT_MEDIA/netronix-product-video-poster.jpg"
}

# ---------------------------------------------------------------------------
# Raster images (PERF-004)
#
# Every source here was between 2.5× and 8× larger than the box it renders in.
# Two widths each, wired up as `srcset`; `q=82` is where the eye stops seeing
# the difference on these particular images.

webp() { # webp <source> <width> <output>
  ffmpeg -y -v error -i "$1" -vf "scale=$2:-2:flags=lanczos" \
    -c:v libwebp -quality 82 -compression_level 6 "$3"
}

images() {
  # Slider category cards — rendered at 310×420 CSS px (220×300 on mobile).
  for pair in \
    "src/assets/category_images/Laptops category.png|laptops-category" \
    "src/assets/category_images/pc pic 2.png|pc-category" \
    "src/assets/category_images/m4 pro macbook.png|macbook-category" \
    "src/assets/category_images/Headphones.jpg|headphones-category" \
    "src/assets/category_images/Earphones.jpg|earphones-category" \
    "src/assets/category_images/Speakers.jpg|speakers-category" \
    "src/assets/category_images/Accessories.jpg|accessories-category" \
    "src/assets/category_images/Gaming.jpg|gaming-category"
  do
    source="${pair%%|*}"; name="${pair##*|}"
    webp "$source" 400 "$OUT_IMG/$name-400.webp"
    webp "$source" 800 "$OUT_IMG/$name-800.webp"
  done

  # Image comparison — a square that is at most ~640 CSS px wide.
  webp "src/assets/comparison/before.png" 800  "$OUT_IMG/comparison-before-800.webp"
  webp "src/assets/comparison/before.png" 1600 "$OUT_IMG/comparison-before-1600.webp"
  webp "src/assets/comparison/after.png"  800  "$OUT_IMG/comparison-after-800.webp"
  webp "src/assets/comparison/after.png"  1600 "$OUT_IMG/comparison-after-1600.webp"

  # Countdown banner — full-bleed strip, 1555×600 source.
  webp "src/assets/all/macbook m4.png" 800  "$OUT_IMG/countdown-banner-800.webp"
  webp "src/assets/all/macbook m4.png" 1555 "$OUT_IMG/countdown-banner-1555.webp"

  # Shop the Look — the large editorial photograph, 2000×1125 source.
  webp "src/assets/ShopTheLook/ShopTheLook.jpeg" 800  "$OUT_IMG/shop-the-look-800.webp"
  webp "src/assets/ShopTheLook/ShopTheLook.jpeg" 1600 "$OUT_IMG/shop-the-look-1600.webp"
}

case "${1:-all}" in
  video)  video_h264; video_vp9; video_poster ;;
  images) images ;;
  all)    video_h264; video_vp9; video_poster; images ;;
  *)      echo "usage: $0 [all|video|images]" >&2; exit 64 ;;
esac

echo "done — outputs in $OUT_MEDIA and $OUT_IMG"
