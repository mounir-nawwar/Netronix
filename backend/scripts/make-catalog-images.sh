#!/usr/bin/env bash
# How the seeded catalog's product photography in `scripts/assets/catalog/` was
# produced, so it can be reproduced or re-tuned rather than taken on trust.
#
# This is the sibling of `frontend/scripts/optimise-media.sh` and follows the
# same rules: everything runs locally against files already in this repository,
# it contacts no service, uploads nothing, and needs only `ffmpeg` on PATH
# (6.1.1 was used). The outputs are committed, because the seed reads them at
# import time and a seed that needs a build step is a seed that will be run
# without one.
#
#   ./scripts/make-catalog-images.sh
#
# ---------------------------------------------------------------------------
# Why the sources are in the frontend
# ---------------------------------------------------------------------------
# `frontend/src/assets/` already held real product photography — it is what the
# homepage's category slider, Shop the Look and before/after comparison are
# built from. The seeded *catalog*, meanwhile, had no photography at all: every
# product image was a generated SVG. So the storefront was showing real photos
# of laptops on the homepage and line art of laptops on the products page.
#
# These are the nine assets that survive the only test that matters — does the
# picture show the thing the product actually is. A monitor drawn as a laptop or
# a mouse drawn as a USB cable is worse than no photograph, so products with no
# honest match keep their silhouette (see `demoArtwork.js`).
#
# ---------------------------------------------------------------------------
# The keying pipeline
# ---------------------------------------------------------------------------
# Four of the sources are JPEGs shot on white, and the catalog paints products
# on a #f2f1ee plate — so an unkeyed JPEG shows as a white box floating on the
# plate. Removing that background is three filters and one correction:
#
#   1. `lutrgb`    — snap everything at or above 232 to pure white. JPEG noise
#                    means the "white" backdrop is really 246-255 with a soft
#                    shadow trailing off below it; without this the flood fill
#                    stops at the first noisy pixel and leaves a halo. 232 was
#                    chosen by sweeping 244/232/222: at 244 the shadow survives,
#                    at 222 the fill starts eating the products' own highlights.
#   2. `floodfill` — from the corner, white -> a sentinel colour. A *flood* fill
#                    rather than a global colour key on purpose: three of these
#                    products are silver or white, and a global key punches
#                    holes straight through them. Only pixels connected to the
#                    border are background.
#   3. `colorkey`  — sentinel -> transparent.
#   4. `geq`       — despill. `colorkey` produces binary alpha, so a pixel that
#                    is *near* the sentinel rather than equal to it survives
#                    fully opaque and carries the sentinel's tint: the soft
#                    shadows came out with a blue-violet fringe. Clamping blue
#                    to max(red, green) pulls that back to neutral. These are
#                    greyscale-ish photographs, so a genuine pixel has R≈G≈B and
#                    is unchanged; only the tinted fringe moves. What is left is
#                    a faint grey halo that reads as the product's own shadow.
#
# `floodfill`'s destination is written `d0=1 d1=254 d2=1` and comes out as
# RGB(1,1,254) — the filter's channel order is not the RGB the parameter names
# suggest. The key below matches what it actually produces, which is why it is
# 0x0101FE and not the 0x01FE01 the arguments read like.

set -euo pipefail

cd "$(dirname "$0")/.."

SRC="../frontend/src/assets"
OUT="scripts/assets/catalog"

WIDTH=720          # ~2x the 400px the card plate renders at
QUALITY=76         # 17-26 kB per image; they are embedded in the seed as data URIs

mkdir -p "$OUT"

KEY="lutrgb=r='if(gte(val,232),255,val)':g='if(gte(val,232),255,val)':b='if(gte(val,232),255,val)'"
KEY="$KEY,floodfill=x=2:y=2:s0=255:s1=255:s2=255:d0=1:d1=254:d2=1"
KEY="$KEY,format=rgba,colorkey=0x0101FE:0.10:0.0"
KEY="$KEY,geq=r='r(X,Y)':g='g(X,Y)':b='min(b(X,Y),max(r(X,Y),g(X,Y)))':a='alpha(X,Y)'"

# Already cut out on transparency — scale only.
cutout() {
    ffmpeg -hide_banner -loglevel error -y -i "$SRC/$1" \
        -vf "scale=$WIDTH:-1" -frames:v 1 \
        -c:v libwebp -q:v "$QUALITY" "$OUT/$2"
    printf '  %-22s %7s bytes\n' "$2" "$(stat -c%s "$OUT/$2")"
}

# Shot on white — key the background out first.
keyed() {
    ffmpeg -hide_banner -loglevel error -y -i "$SRC/$1" \
        -vf "$KEY,scale=$WIDTH:-1" -frames:v 1 \
        -c:v libwebp -q:v "$QUALITY" "$OUT/$2"
    printf '  %-22s %7s bytes\n' "$2" "$(stat -c%s "$OUT/$2")"
}

echo "catalog product imagery -> $OUT"

# The two MacBooks are the only exact matches in the set: the comparison pair is
# a space-black and a silver MacBook Pro, which is what those two products are.
cutout "comparison/after.png"                  macbook-pro.webp
cutout "comparison/before.png"                 macbook-air.webp
cutout "category_images/Laptops category.png"  laptop.webp
cutout "category_images/pc pic 2.png"          desktop-pc.webp

keyed  "category_images/Headphones.jpg"        headphones.webp
keyed  "category_images/Gaming.jpg"            gaming-headset.webp
keyed  "category_images/Earphones.jpg"         earphones.webp
keyed  "category_images/Speakers.jpg"          speakers.webp

echo "done."
