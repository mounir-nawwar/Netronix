// The seeded catalog's imagery.
//
// The generator this replaced returned the *same picture* for every product: a
// dark gradient square with the brand and product name stamped on it, plus the
// words "NETRONIX DEMO IMAGE", four times each with only a view label to tell
// the four apart. Twenty products, eighty images, one picture. The storefront's
// products page was twenty indistinguishable tiles, and the card's
// pointer-scrub interaction — which exists to preview a product's photographs
// without a click — had nothing to scrub between.
//
// What replaced it resolves each product one of two ways: a real photograph cut
// out of `frontend/src/assets/` by `make-catalog-images.sh`, or a drawn
// silhouette. Both halves have a property worth holding.
//
// The drawn half must stay *distinct* — that was the whole defect.
//
// The photographed half must stay *honest*, and that is the one a future edit
// is most likely to break. There is no picture in the asset set of a mouse, a
// keyboard, a monitor, a power bank or a stream deck, and the tempting fix —
// point them at the nearest available photo — makes the catalog assert
// something false about what is for sale. A product page illustrating a 27-inch
// monitor with a photograph of a laptop is worse than one illustrating it with
// a line drawing of a monitor, however much better it looks in a grid.

import { describe, it, expect } from 'vitest'

import { DEMO_VIEWS, demoImage, imagesFor, photoFileFor, shapeFor } from '../../scripts/demoArtwork.js'
import { products as productFixtures } from '../../scripts/seedData.js'

const decode = (uri) => Buffer.from(uri.split(',')[1], 'base64').toString('utf8')

const find = (name) => {
    const product = productFixtures.find((candidate) => candidate.name === name)
    if (!product) throw new Error(`no seeded product called ${name}`)
    return product
}

// ---------------------------------------------------------------------------
describe('a photograph is only used when it shows the product', () => {
    // The asset set holds a laptop, a desktop tower, two MacBooks, headphones,
    // a gaming headset, earphones and speakers. Nothing else.
    it.each([
        ['Razer Cobra Pro', 'a mouse'],
        ['Logitech MX Master 4', 'a mouse'],
        ['Keychron Q3 Max', 'a keyboard'],
        ['LG UltraGear 27" OLED', 'a monitor'],
        ['Anker Prime 27K Power Bank', 'a power bank'],
        ['Elgato Stream Deck XL', 'a stream deck'],
    ])('%s is drawn, because the assets hold no picture of %s', (name) => {
        expect(photoFileFor(find(name))).toBeNull()
    })

    it.each([
        ['MacBook Pro 16" M4 Pro', 'macbook-pro.webp'],
        ['MacBook Air 13" M4', 'macbook-air.webp'],
        ['Dell XPS 15', 'laptop.webp'],
        ['Corsair One i500', 'desktop-pc.webp'],
        ['Sony WH-1000XM6', 'headphones.webp'],
        ['SteelSeries Arctis Nova Pro', 'gaming-headset.webp'],
        ['Sennheiser Momentum True Wireless 4', 'earphones.webp'],
        ['Sonos Era 300', 'speakers.webp'],
    ])('%s is photographed with %s', (name, file) => {
        expect(photoFileFor(find(name))).toBe(file)
    })

    it('never resolves a photograph the generator did not produce', () => {
        // A mapping entry naming a file that `make-catalog-images.sh` does not
        // write throws on read rather than silently serving a broken image, and
        // this is where that shows up as a failing test instead of a blank
        // plate in production.
        for (const product of productFixtures) {
            expect(() => imagesFor(product), product.name).not.toThrow()
        }
    })
})

// ---------------------------------------------------------------------------
describe('the images a product actually gets', () => {
    it('gives a photographed product exactly one image, not four copies of one', () => {
        // Padding a single photograph out to four frames would put four
        // identical images behind a pager promising four different ones — which
        // is the defect this whole module exists to have fixed, reached from the
        // other direction. `ProductCard` renders no pager for a single image.
        const images = imagesFor(find('Sony WH-1000XM6'))
        expect(images).toHaveLength(1)
        expect(images[0].startsWith('data:image/webp;base64,')).toBe(true)
    })

    it('gives a drawn product four genuinely different views', () => {
        const images = imagesFor(find('Logitech MX Master 4'))
        expect(images).toHaveLength(DEMO_VIEWS.length)
        expect(new Set(images).size).toBe(DEMO_VIEWS.length)
    })

    it('draws no two products the same, across the whole catalog', () => {
        const drawn = productFixtures
            .filter((product) => photoFileFor(product) === null)
            .map((product) => demoImage(product, 'FRONT'))

        expect(drawn.length).toBeGreaterThan(0)
        expect(new Set(drawn).size, 'two drawn products share a picture').toBe(drawn.length)
    })

    it('carries no demo watermark and no brand wordmark', () => {
        // The old generator stamped "NETRONIX DEMO IMAGE" across the bottom of
        // every tile and the brand across the top — and the card, the product
        // page and the cart line all print the brand next to the image anyway,
        // so it read twice on every card.
        //
        // Asserted against the drawing's *rendered text* rather than the whole
        // document, because the `aria-label` legitimately carries the product
        // name, and a brand can be a substring of one: "LG UltraGear" would
        // fail a naive search for "LG" on a picture that draws no wordmark at
        // all.
        for (const product of productFixtures) {
            for (const image of imagesFor(product)) {
                if (!image.startsWith('data:image/svg+xml')) continue

                const drawn = [...decode(image).matchAll(/<text[^>]*>([^<]*)<\/text>/g)]
                    .map((match) => match[1])

                // One label, and it is the view name.
                expect(drawn, product.name).toHaveLength(1)
                expect(DEMO_VIEWS, product.name).toContain(drawn[0])
                expect(drawn[0], product.name).not.toMatch(/DEMO IMAGE/i)
            }
        }
    })

    it('labels every drawn view for a screen reader', () => {
        const svg = decode(demoImage(find('Keychron Q3 Max'), 'SIDE'))
        expect(svg).toMatch(/role="img"/)
        expect(svg).toMatch(/aria-label="Keychron Q3 Max, side view"/)
    })

    it('escapes a product name that carries a quote', () => {
        // `MacBook Pro 16" M4 Pro` — an unescaped `"` closes the attribute and
        // produces an SVG the browser will not parse.
        const svg = decode(demoImage({ name: 'MacBook Pro 16" M4 Pro', tags: ['Laptops'] }, 'FRONT'))
        expect(svg).toContain('MacBook Pro 16&quot; M4 Pro')
        expect(svg).not.toContain('16" M4')
    })
})

// ---------------------------------------------------------------------------
describe('the drawn set covers the catalog it is asked to draw', () => {
    it('has a shape for every product that falls through to one', () => {
        for (const product of productFixtures) {
            if (photoFileFor(product) !== null) continue
            expect(typeof shapeFor(product), product.name).toBe('string')
            expect(() => demoImage(product, 'FRONT'), product.name).not.toThrow()
        }
    })

    it('does not draw a monitor as a laptop, or a mouse as a keyboard', () => {
        // `Accessories` is the catalog's catch-all and holds all three, so the
        // tag alone cannot tell them apart — the name has to be consulted first.
        expect(shapeFor(find('LG UltraGear 27" OLED'))).toBe('monitor')
        expect(shapeFor(find('Razer Cobra Pro'))).toBe('mouse')
        expect(shapeFor(find('Logitech MX Master 4'))).toBe('mouse')
        expect(shapeFor(find('Keychron Q3 Max'))).toBe('keyboard')
        expect(shapeFor(find('Anker Prime 27K Power Bank'))).toBe('brick')
        expect(shapeFor(find('Elgato Stream Deck XL'))).toBe('deck')
    })
})
