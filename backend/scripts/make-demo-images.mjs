#!/usr/bin/env node
/**
 * Regenerate the seeded catalog's placeholder product imagery.
 *
 * Why this exists
 * ---------------
 * The seed at `recovery/products.mongoimport.json` carries four images per
 * product and every one of the eighty is a generated SVG of the same thing: a
 * dark navy-to-purple gradient square, a circle outline, the brand name, the
 * product name, a view label, and the words "NETRONIX DEMO IMAGE". The four
 * views of one product differ only by that label, so the card's pointer-scrub
 * interaction — which exists to preview the whole set without a click — moves
 * between four images a visitor cannot tell apart.
 *
 * The practical effect is that the products page is twenty near-identical dark
 * purple tiles. No amount of typography or motion rescues that, and it accounts
 * for more of the "this looks generated" impression than any CSS on the page.
 * (The older `seed_new_products.js` is worse: every product points at the same
 * `res.cloudinary.com/demo/.../sample.jpg`.)
 *
 * The drawings themselves live in `demoArtwork.js`, which `seedData.js` also
 * imports — a running database and this export must not disagree about what a
 * product looks like.
 *
 * What this generates
 * -------------------
 * These are still placeholders and they are not pretending otherwise — the
 * honest fix is real product photography, and this script exists so the catalog
 * is presentable until there is some. What changes:
 *
 *   * **The light palette the catalog now uses.** A `#f2f1ee` plate with a
 *     `#121214` line drawing, so a product sits on the same surface the card
 *     paints behind it rather than fighting it.
 *   * **A silhouette per product**, chosen from its own name and tags: a laptop
 *     is a laptop, a monitor is a monitor, a mouse is a mouse. Twenty tiles that
 *     differ from each other is the entire point.
 *   * **Four genuinely different views** — front, angle, side and detail — so
 *     scrubbing and the dot row are showing something real.
 *   * **No "DEMO IMAGE" stamp.** The brand wordmark and a small view label are
 *     all the text, which is what a product photograph's alt region would carry.
 *
 * Usage
 * -----
 *   node backend/scripts/make-demo-images.mjs                 # rewrite in place
 *   node backend/scripts/make-demo-images.mjs --dry-run       # report only
 *   node backend/scripts/make-demo-images.mjs --out other.json
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { imagesFor, photoFileFor, shapeFor } from './demoArtwork.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_SEED = resolve(HERE, '../../../../recovery/products.mongoimport.json')

// ---------------------------------------------------------------------------

function main() {
    const args = process.argv.slice(2)
    const dryRun = args.includes('--dry-run')
    const outIndex = args.indexOf('--out')
    const seedPath = resolve(process.cwd(), args.find((a) => a.endsWith('.json') && a !== args[outIndex + 1]) ?? DEFAULT_SEED)
    const outPath = outIndex === -1 ? seedPath : resolve(process.cwd(), args[outIndex + 1])

    const products = JSON.parse(readFileSync(seedPath, 'utf8'))
    if (!Array.isArray(products)) {
        throw new Error(`${seedPath} is not an array of products`)
    }

    let replaced = 0
    for (const product of products) {
        product.image = imagesFor(product)
        replaced += product.image.length
        if (dryRun) {
            const source = photoFileFor(product) ?? `drawn: ${shapeFor(product)}`
            console.log(`  ${String(product.brand).padEnd(12)} ${String(product.name).padEnd(40)} → ${source}`)
        }
    }

    console.log(`${products.length} products, ${replaced} images${dryRun ? ' (dry run, nothing written)' : ''}`)
    if (dryRun) return

    writeFileSync(outPath, `${JSON.stringify(products, null, 2)}\n`)
    console.log(`written to ${outPath}`)
}

main()
