// The seeded catalog's placeholder product artwork.
//
// One module, imported by both the seed (`seedData.js`, which is what a running
// database is built from) and `make-demo-images.mjs` (which rewrites the
// recovery export). Two copies of the drawings would drift, and the two
// artefacts would then disagree about what the same product looks like.
//
// What this replaced
// ------------------
// `demoImage(name, brand, view)` returned the same picture for every product in
// the catalog: a dark navy-to-purple gradient square, a circle outline, the
// brand name, the product name, a view label, and the words "NETRONIX DEMO
// IMAGE". Four views per product differed only by that label, so the card's
// pointer-scrub interaction — which exists to preview the whole set without a
// click — moved between four images nobody could tell apart, and the products
// page was twenty identical dark tiles.
//
// No amount of typography or motion on the grid rescues that. It accounted for
// more of the "this looks generated" impression than any CSS on the page.
//
// What this generates
// -------------------
// These are still placeholders and are not pretending otherwise; the honest fix
// is real product photography, and this exists so the catalog is presentable
// until there is some. Three things changed:
//
//   * **The light palette the catalog now uses** — a `#f2f1ee` plate with a
//     `#121214` line drawing, so a product sits on the same surface the card
//     paints behind it rather than fighting it.
//   * **A silhouette per product**, chosen from the product's own name and
//     tags. Twenty tiles that differ from each other is the entire point.
//   * **Four genuinely different views.** `ANGLE` skews the geometry, `SIDE`
//     collapses the depth axis and `DETAIL` crops in on the part that
//     identifies the object — so scrubbing and the dot row show something real.
//
// There is no "DEMO IMAGE" stamp and no brand wordmark. A small view label is
// the only text: the card and the product page both print the brand right
// beside the image, and stamping it into the artwork as well read as a
// placeholder doing an impression of a photograph.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLATE = '#f2f1ee'
const INK = '#121214'
const MUTED = '#8e8e95'

const SIZE = 900

/** The four views a *drawn* product gets, in the order the card scrubs through them. */
export const DEMO_VIEWS = ['FRONT', 'ANGLE', 'SIDE', 'DETAIL']

// ---------------------------------------------------------------------------
// Real photography, where there is any
// ---------------------------------------------------------------------------
//
// `frontend/src/assets/` already held real product photography — it is what the
// homepage's category slider, Shop the Look and before/after comparison are
// built from — while the seeded catalog had none at all. The storefront was
// therefore showing photographs of laptops on the homepage and line art of
// laptops on the products page.
//
// `scripts/make-catalog-images.sh` cuts the usable ones out onto transparency
// and writes them next door. The rule for using one is narrow and it is the
// only rule: **the picture has to show the thing the product actually is.** A
// monitor illustrated with a laptop, or a mouse with a USB cable, is worse than
// no photograph — it is a page asserting something false about what is for
// sale. Six of the twenty products have no honest match in the set and keep
// their silhouette, which is why this catalog is deliberately of mixed
// fidelity rather than uniformly wrong.
//
// Matching is by name first, because the tags cannot separate a keyboard from a
// monitor from a power bank — `Accessories` holds all three.

const HERE = dirname(fileURLToPath(import.meta.url))
const PHOTO_DIR = join(HERE, 'assets/catalog')

/** Name patterns, most specific first. */
const PHOTO_BY_NAME = [
    [/macbook pro/i, 'macbook-pro.webp'],
    [/macbook air/i, 'macbook-air.webp'],
    [/arctis|steelseries/i, 'gaming-headset.webp'],
]

/** Then the tag, for the categories where one photograph is honest for all of them. */
const PHOTO_BY_TAG = [
    ['Headphones', 'headphones.webp'],
    ['Earphones', 'earphones.webp'],
    ['Speakers', 'speakers.webp'],
    ['Gaming PCs', 'desktop-pc.webp'],
    ['Laptops', 'laptop.webp'],
]

/** Read once per process; the seed builds twenty products from eight files. */
const photoCache = new Map()

function photoDataUri(file) {
    if (!photoCache.has(file)) {
        const bytes = readFileSync(join(PHOTO_DIR, file))
        photoCache.set(file, `data:image/webp;base64,${bytes.toString('base64')}`)
    }
    return photoCache.get(file)
}

/**
 * The photograph for a product, or `null` when there is no honest match.
 *
 * Exported so the generator can report the split, and so a test can assert that
 * the mapping only ever claims a picture it can stand behind.
 */
export function photoFileFor(product) {
    const name = String(product?.name ?? '')
    for (const [pattern, file] of PHOTO_BY_NAME) {
        if (pattern.test(name)) return file
    }

    const tags = Array.isArray(product?.tags) ? product.tags : []
    for (const [tag, file] of PHOTO_BY_TAG) {
        if (tags.includes(tag)) return file
    }
    return null
}

/**
 * Every image for a product, in the order the card scrubs through them.
 *
 * A photographed product gets **one** image, because one photograph is what
 * exists. Padding it out to four would put four identical frames behind a dot
 * row that promises four different ones — which is the exact defect the drawn
 * set was rebuilt to fix, arrived at from the other direction. `ProductCard`
 * already renders no pager for a single image.
 */
export function imagesFor(product) {
    const file = photoFileFor(product)
    if (file) return [photoDataUri(file)]
    return DEMO_VIEWS.map((view) => demoImage(product, view))
}

/**
 * Which silhouette a product gets, decided by its tags.
 *
 * Ordered most specific first: a Keychron keyboard is tagged both `Accessories`
 * and `Gaming`, and `Gaming` alone would draw it as a tower.
 */
const SHAPE_BY_TAG = [
    ['MacBooks', 'laptop'],
    ['Laptops', 'laptop'],
    ['Gaming PCs', 'tower'],
    ['Headphones', 'headphones'],
    ['Earphones', 'earbuds'],
    ['Speakers', 'speaker'],
    ['Accessories', 'keyboard'],
    ['Gaming', 'keyboard'],
]

/**
 * Names that decide the shape before the tags get a say.
 *
 * `Accessories` is the catalog's catch-all, and it holds a monitor, a mouse and
 * a power bank alongside the keyboards. Drawing all four as a keyboard would
 * put the whole point of this script — twenty tiles that differ from each other
 * — back where it started for a fifth of the catalog.
 */
const SHAPE_BY_NAME = [
    [/ultragear|monitor|\boled\b|display/i, 'monitor'],
    [/mouse|cobra|mx master/i, 'mouse'],
    [/power ?bank|charger|battery/i, 'brick'],
    [/stream deck|deck\b/i, 'deck'],
    [/keyboard|keychron/i, 'keyboard'],
]

export function shapeFor(product) {
    const name = String(product?.name ?? '')
    for (const [pattern, shape] of SHAPE_BY_NAME) {
        if (pattern.test(name)) return shape
    }

    const tags = Array.isArray(product?.tags) ? product.tags : []
    for (const [tag, shape] of SHAPE_BY_TAG) {
        if (tags.includes(tag)) return shape
    }
    return 'keyboard'
}

/** XML-escape, because product names carry `"` — `MacBook Pro 16" M4 Pro`. */
const esc = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')

/**
 * The line drawings.
 *
 * Each returns the body of a `<g>` centred on a 900×900 canvas. `view` shifts
 * the geometry rather than just relabelling it, so the four images of a product
 * really are four images: `ANGLE` skews, `SIDE` collapses the depth axis, and
 * `DETAIL` crops in on the part that identifies the thing.
 */
const SHAPES = {
    laptop(view) {
        if (view === 'SIDE') {
            return `
                <path d="M300 520 L470 300" />
                <path d="M300 520 L640 520" />
                <path d="M300 520 L296 536 L644 536 L640 520 Z" />
                <path d="M470 300 L478 306" />`
        }
        if (view === 'DETAIL') {
            // The keyboard deck, close up.
            return `
                <rect x="250" y="330" width="400" height="240" rx="8" />
                ${Array.from({ length: 5 }, (_, row) =>
                    Array.from({ length: 12 }, (_, col) =>
                        `<rect x="${268 + col * 31}" y="${348 + row * 44}" width="24" height="34" rx="4" />`,
                    ).join(''),
                ).join('')}`
        }
        const skew = view === 'ANGLE' ? 26 : 0
        return `
            <path d="M${300 + skew} 300 L${600 + skew} 300 L${600 - skew} 520 L${300 - skew} 520 Z" />
            <path d="M${318 + skew} 318 L${582 + skew} 318 L${582 - skew} 502 L${318 - skew} 502 Z" opacity="0.35" />
            <path d="M250 520 L650 520 L672 566 L228 566 Z" />
            <path d="M410 544 L490 544" opacity="0.5" />`
    },

    tower(view) {
        if (view === 'DETAIL') {
            // The GPU fans behind the side panel.
            return `
                <rect x="270" y="300" width="360" height="300" rx="10" />
                <circle cx="360" cy="450" r="62" />
                <circle cx="360" cy="450" r="18" />
                <circle cx="540" cy="450" r="62" />
                <circle cx="540" cy="450" r="18" />`
        }
        if (view === 'SIDE') {
            return `
                <rect x="380" y="230" width="140" height="440" rx="10" />
                <path d="M400 260 L500 260" opacity="0.5" />
                <path d="M400 640 L500 640" opacity="0.5" />`
        }
        const depth = view === 'ANGLE' ? 44 : 0
        return `
            <rect x="330" y="230" width="240" height="440" rx="10" />
            ${depth ? `<path d="M570 230 L${570 + depth} ${230 - depth / 2} L${570 + depth} ${670 - depth / 2} L570 670 Z" opacity="0.35" />` : ''}
            <circle cx="450" cy="340" r="52" />
            <circle cx="450" cy="470" r="52" />
            <circle cx="450" cy="600" r="34" />`
    },

    headphones(view) {
        if (view === 'DETAIL') {
            return `
                <circle cx="450" cy="450" r="150" />
                <circle cx="450" cy="450" r="96" />
                <circle cx="450" cy="450" r="16" />`
        }
        if (view === 'SIDE') {
            return `
                <path d="M450 250 C 360 250 330 330 330 400 L330 520" />
                <rect x="290" y="400" width="82" height="150" rx="34" />`
        }
        const lean = view === 'ANGLE' ? 22 : 0
        return `
            <path d="M300 470 L300 400 C300 300 380 250 450 250 C520 250 600 300 600 400 L600 470" />
            <rect x="${252 + lean}" y="440" width="86" height="180" rx="40" />
            <rect x="${562 - lean}" y="440" width="86" height="180" rx="40" />`
    },

    earbuds(view) {
        if (view === 'DETAIL') {
            return `
                <circle cx="450" cy="420" r="120" />
                <path d="M450 540 L450 640" />
                <circle cx="450" cy="420" r="46" />`
        }
        if (view === 'SIDE') {
            return `
                <rect x="330" y="380" width="240" height="170" rx="60" />
                <path d="M450 380 L450 550" opacity="0.4" />`
        }
        const spread = view === 'ANGLE' ? 30 : 0
        return `
            <circle cx="${370 - spread}" cy="400" r="78" />
            <path d="M${370 - spread} 478 L${356 - spread} 590" />
            <circle cx="${530 + spread}" cy="400" r="78" />
            <path d="M${530 + spread} 478 L${544 + spread} 590" />`
    },

    speaker(view) {
        if (view === 'DETAIL') {
            return `
                <circle cx="450" cy="450" r="180" />
                <circle cx="450" cy="450" r="120" />
                <circle cx="450" cy="450" r="40" />`
        }
        if (view === 'SIDE') {
            return `
                <path d="M390 250 C 330 350 330 550 390 650 L510 650 C 570 550 570 350 510 250 Z" />`
        }
        const squash = view === 'ANGLE' ? 34 : 0
        return `
            <rect x="${340 + squash / 2}" y="240" width="${220 - squash}" height="420" rx="${110 - squash / 2}" />
            <circle cx="450" cy="380" r="66" />
            <circle cx="450" cy="530" r="46" />`
    },

    keyboard(view) {
        if (view === 'DETAIL') {
            // Four keycaps, close enough to see the profile.
            return `
                ${Array.from({ length: 2 }, (_, row) =>
                    Array.from({ length: 2 }, (_, col) =>
                        `<rect x="${330 + col * 130}" y="${330 + row * 130}" width="110" height="110" rx="14" />`,
                    ).join(''),
                ).join('')}`
        }
        if (view === 'SIDE') {
            return `
                <path d="M280 512 L620 496 L620 544 L280 544 Z" />
                <path d="M300 508 L300 486 L600 474 L600 496" opacity="0.5" />`
        }
        const tilt = view === 'ANGLE' ? 18 : 0
        return `
            <rect x="${280 + tilt}" y="360" width="340" height="180" rx="18" />
            ${Array.from({ length: 4 }, (_, row) =>
                Array.from({ length: 8 }, (_, col) =>
                    `<rect x="${300 + tilt + col * 39}" y="${378 + row * 40}" width="30" height="30" rx="5" opacity="0.55" />`,
                ).join(''),
            ).join('')}`
    },

    monitor(view) {
        if (view === 'DETAIL') {
            return `
                <rect x="270" y="300" width="360" height="240" rx="6" />
                <path d="M300 470 L370 400 L420 440 L510 340 L600 470" />
                <circle cx="360" cy="356" r="24" />`
        }
        if (view === 'SIDE') {
            return `
                <path d="M430 250 L462 250 L462 560 L430 560 Z" />
                <path d="M446 560 L446 640" />
                <path d="M380 650 L512 650" />`
        }
        const skew = view === 'ANGLE' ? 30 : 0
        return `
            <path d="M${230 + skew} 250 L${670 + skew} 250 L${670 - skew} 550 L${230 - skew} 550 Z" />
            <path d="M${254 + skew} 274 L${646 + skew} 274 L${646 - skew} 526 L${254 - skew} 526 Z" opacity="0.35" />
            <path d="M450 550 L450 630" />
            <path d="M356 650 L544 650" />`
    },

    mouse(view) {
        if (view === 'DETAIL') {
            return `
                <rect x="410" y="300" width="80" height="140" rx="40" />
                <path d="M450 330 L450 410" opacity="0.5" />
                <path d="M340 500 C 340 440 560 440 560 500" />`
        }
        if (view === 'SIDE') {
            return `
                <path d="M340 620 C 330 460 400 300 470 300 C 540 300 570 460 560 620 Z" />
                <path d="M340 500 L560 500" opacity="0.4" />`
        }
        const lean = view === 'ANGLE' ? 16 : 0
        return `
            <path d="M${360 + lean} 620 C ${320 + lean} 440 ${380 + lean} 280 450 280 C ${520 - lean} 280 ${580 - lean} 440 ${540 - lean} 620 Z" />
            <path d="M450 280 L450 420" opacity="0.5" />
            <path d="M${368 + lean} 420 L${532 - lean} 420" opacity="0.35" />`
    },

    brick(view) {
        if (view === 'DETAIL') {
            return `
                <rect x="330" y="360" width="240" height="180" rx="18" />
                <rect x="400" y="424" width="100" height="52" rx="10" />
                <path d="M420 450 L480 450" opacity="0.5" />`
        }
        if (view === 'SIDE') {
            return `
                <rect x="400" y="250" width="100" height="400" rx="20" />
                <path d="M420 300 L480 300" opacity="0.5" />`
        }
        const depth = view === 'ANGLE' ? 36 : 0
        return `
            <rect x="330" y="250" width="240" height="400" rx="24" />
            ${depth ? `<path d="M570 250 L${570 + depth} ${250 - depth / 2} L${570 + depth} ${650 - depth / 2} L570 650 Z" opacity="0.35" />` : ''}
            ${Array.from({ length: 4 }, (_, i) => `<rect x="${372 + i * 42}" y="580" width="16" height="8" rx="4" opacity="0.6" />`).join('')}
            <rect x="390" y="330" width="120" height="60" rx="12" />`
    },

    deck(view) {
        if (view === 'DETAIL') {
            return `
                ${Array.from({ length: 2 }, (_, row) =>
                    Array.from({ length: 2 }, (_, col) =>
                        `<rect x="${330 + col * 130}" y="${330 + row * 130}" width="110" height="110" rx="16" />`,
                    ).join(''),
                ).join('')}`
        }
        if (view === 'SIDE') {
            return `
                <path d="M330 560 L570 470 L570 520 L330 610 Z" />
                <path d="M330 610 L330 640 L570 550 L570 520" opacity="0.5" />`
        }
        const tilt = view === 'ANGLE' ? 22 : 0
        return `
            <rect x="${300 + tilt}" y="320" width="300" height="260" rx="20" />
            ${Array.from({ length: 4 }, (_, row) =>
                Array.from({ length: 4 }, (_, col) =>
                    `<rect x="${322 + tilt + col * 68}" y="${342 + row * 60}" width="52" height="46" rx="8" opacity="0.55" />`,
                ).join(''),
            ).join('')}`
    },
}

/**
 * One product view as an SVG data URI.
 *
 * `image/svg+xml;base64` because that is the encoding the existing seed uses
 * and `productModel` stores these as plain strings — changing the transport
 * would be a change to the data contract, not to the artwork.
 */
export function demoImage(product, view) {
    const shape = shapeFor(product)
    const drawing = SHAPES[shape](view)

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" role="img" aria-label="${esc(product.name)}, ${view.toLowerCase()} view">`
        + `<rect width="${SIZE}" height="${SIZE}" fill="${PLATE}"/>`
        // A single hairline baseline, so the object sits on a surface rather
        // than floating in the middle of an empty square.
        + `<path d="M150 745 L750 745" stroke="${MUTED}" stroke-width="1" opacity="0.4"/>`
        // Scaled up about the drawing's own centre. The shapes were laid out to
        // fill roughly 45% of the canvas, which was fine when every tile in the
        // grid was one of these — but fourteen of the twenty products carry a
        // photograph now, and a photograph fills about 75%. Side by side the
        // drawings read as smaller objects rather than as a different rendering
        // of the same size of thing. The transform is applied to the drawing
        // only, so the baseline and the label keep their positions.
        + `<g transform="translate(450 440) scale(1.2) translate(-450 -440)" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">${drawing}</g>`
        // The view label and nothing else. The brand wordmark used to be stamped
        // across the top of every one of these, and the card, the product page
        // and the cart line all print the brand immediately beside the image —
        // so it read twice on every tile, which is what a placeholder doing an
        // impression of a photograph looks like.
        + `<text x="450" y="800" text-anchor="middle" fill="${MUTED}" font-family="Verdana,Geneva,sans-serif" font-size="15" letter-spacing="6">${view}</text>`
        + `</svg>`

    return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`
}
