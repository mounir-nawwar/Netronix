// Deterministic demo catalog for the Netronix seed.
//
// Everything in this file is fixed: identifiers, dates, prices, stock levels,
// and the password hash. Running the seed twice produces byte-identical
// documents, which is what makes `--reset` unnecessary for normal use and makes
// the seed usable as a test fixture.
//
// ---------------------------------------------------------------------------
// Homepage showcase assignments (FE-004, PORT-001)
//
// Until Phase 3, five storefront components looked their products up by literal
// ObjectId, so a fresh database produced a visibly broken homepage. The seed
// worked around it by adopting those exact ids as its primary keys — a
// documented shim, not a design.
//
// That is over. The components now select by `showcase`, a field on the product
// declaring which homepage surface it belongs to and where in that surface it
// sits, and this file is the demo catalog's editorial answer to that question:
//
//     showcase: [{ slot: 'shop-the-look', order: 1 }, { slot: 'featured', order: 0 }]
//
// `order` is per slot, because one product legitimately occupies two surfaces at
// two positions. Assignments are **written to MongoDB** now — `productModel` has
// the path, and migration `008_showcase` adds it to existing documents.
//
// The ids below are still the ones the old literals used. They stay for a
// duller reason than before: changing a seeded primary key would invalidate
// every bookmark, order line and test fixture that names one, for no gain.
// Nothing reads them by literal any more, which is the part that mattered.
// ---------------------------------------------------------------------------

import { imagesFor } from './demoArtwork.js'

// A fixed clock. Products are dated backwards from this instant so that
// sort-by-newest is stable across runs and machines.
const CATALOG_EPOCH = Date.UTC(2026, 7, 1, 12, 0, 0) // 2026-08-01T12:00:00Z
const DAY = 24 * 60 * 60 * 1000

/**
 * A bcrypt hash of DEMO_CUSTOMER_PASSWORD produced with a fixed salt.
 *
 * bcrypt generates a random salt by default, which would make the seeded user
 * document differ on every run and break idempotency. The salt is a constant so
 * the hash is a constant. It protects nothing — this is a demo account whose
 * password is printed in the README — and it must never be reused anywhere else.
 */
export const DEMO_CUSTOMER_PASSWORD = 'NetronixDemo123!'
export const DEMO_BCRYPT_SALT = '$2b$10$NetronixDemoSeedSalt00'

/** Ids for demo products that no frontend file references. Obviously synthetic. */
const seededId = (n) => `5eed${String(n).padStart(20, '0')}`

/**
 * Catalog imagery.
 *
 * Still data URIs rather than hosted URLs, for the reasons they always were:
 * the seed must work with no network access, produce identical bytes on every
 * run, and add no third-party dependency. It is also the only shape that works
 * everywhere the field is read — the storefront and the admin console are
 * served from different origins, and the admin puts `image[0]` straight into a
 * `src`, so a root-relative path would resolve against the wrong host there.
 * Real deployments store Cloudinary URLs.
 *
 * The generator that used to live in this file returned one dark gradient
 * square with the brand and product name stamped on it, identically for all
 * twenty products, with four views per product that differed only by a text
 * label — so the products page was twenty indistinguishable tiles and the
 * card's pointer-scrub interaction had nothing to scrub between.
 *
 * `demoArtwork.js` replaces it, and is shared with `make-demo-images.mjs` so a
 * running database and the recovery export cannot disagree about what a product
 * looks like. It resolves each product one of two ways:
 *
 *   * a **photograph**, cut out onto transparency by
 *     `make-catalog-images.sh` from the real product shots already in
 *     `frontend/src/assets/` — fourteen of the twenty;
 *   * four drawn **views** otherwise.
 *
 * The split is deliberate and the rule is narrow: a photograph is used only
 * when it shows the thing the product actually is. There is no picture in the
 * set of a mouse, a keyboard, a monitor, a power bank or a stream deck, and
 * illustrating those with the nearest available photo would be the catalog
 * asserting something false about what is for sale.
 */

/**
 * Build a product document.
 *
 * `inventory` keys are variant option values joined with "-", which is exactly
 * what `frontend/src/pages/Product.jsx:83-90` and `admin/src/pages/Add.jsx:199`
 * generate. That encoding is ambiguous whenever an option value itself contains
 * a hyphen (DB-003) — the catalog below includes several such products
 * deliberately, so the defect is reachable from a seeded database.
 *
 * A product with no variants uses the empty string as its single inventory key,
 * because that is what `getVariantKey()` returns for a variant-less product.
 */
/** One showcase assignment. Named so the fixtures below read as a table. */
const slot = (name, order = 0) => ({ slot: name, order })

function product({ id, name, brand, price, description, tags, variants = [], inventory, bestSeller = false, ageDays, showcase = [] }) {
    return {
        _id: id,
        name,
        brand,
        price,
        description,
        tags,
        variants,
        inventory,
        bestSeller,
        // A real photograph where the assets hold one that honestly shows this
        // product, four drawn views where they do not. Decided from the name
        // and the tags, so this has to be given the product rather than just
        // its name and brand.
        image: imagesFor({ name, brand, tags }),
        date: CATALOG_EPOCH - ageDays * DAY,
        // Persisted since Phase 3 (FE-004): this is how the homepage selects.
        showcase,
    }
}

export const VARIANT_LESS_KEY = ''

export const products = [
    // ---- MacBooks ---------------------------------------------------------
    product({
        id: '680897a3a9a5ffb06b2e52c8', // FeaturedProducts.macbooks[0] + ShopTheLook.macbook
        name: 'MacBook Pro 16" M4 Pro',
        brand: 'Apple',
        price: 2499,
        description:
            'The 16-inch MacBook Pro with the M4 Pro chip pairs a 14-core CPU and 20-core GPU with a Liquid Retina XDR display. Built for sustained creative work: 22-hour battery life, three Thunderbolt 5 ports, and a fan curve that stays quiet under load.',
        tags: ['MacBooks', 'Laptops'],
        // Two axes, and the first axis carries hyphenated values (DB-003).
        variants: [
            { name: 'Size', options: ['14-inch', '16-inch'] },
            { name: 'Storage', options: ['512GB', '1TB', '2TB'] },
        ],
        inventory: {
            '14-inch-512GB': 6,
            '14-inch-1TB': 3,
            '14-inch-2TB': 0,   // zero stock
            '16-inch-512GB': 4,
            '16-inch-1TB': 1,   // single unit — the race-condition path
            '16-inch-2TB': 2,
        },
        bestSeller: true,
        ageDays: 3,
        showcase: [slot('featured', 0), slot('shop-the-look', 1)],
    }),
    product({
        id: '6808d9f6c448f5e2e77e997e', // FeaturedProducts.macbooks[1]
        name: 'MacBook Air 13" M4',
        brand: 'Apple',
        price: 1149,
        description:
            'Fanless, 1.24 kg, and fast enough for everything short of sustained rendering. The M4 Air runs silent through a full working day and charges over USB-C or MagSafe.',
        tags: ['MacBooks', 'Laptops'],
        variants: [{ name: 'Colour', options: ['Midnight', 'Starlight', 'Space-Grey'] }],
        inventory: { Midnight: 9, Starlight: 5, 'Space-Grey': 0 },
        bestSeller: true,
        ageDays: 9,
        showcase: [slot('featured', 1)],
    }),

    // ---- Laptops ----------------------------------------------------------
    product({
        id: '6808ddaf34c8892e5062bd29', // FeaturedProducts.laptops[0]
        name: 'ASUS ROG Zephyrus G16',
        brand: 'ASUS',
        price: 2199,
        description:
            'A 16-inch OLED gaming laptop that is 1.5 cm thick. Nebula HDR display at 240 Hz, vapour chamber cooling, and a chassis that does not sound like a hairdryer at full tilt.',
        tags: ['Laptops', 'Gaming'],
        variants: [
            { name: 'GPU', options: ['RTX-4070', 'RTX-4090'] },
            { name: 'RAM', options: ['16GB', '32GB'] },
        ],
        inventory: { 'RTX-4070-16GB': 7, 'RTX-4070-32GB': 2, 'RTX-4090-16GB': 1, 'RTX-4090-32GB': 0 },
        bestSeller: true,
        ageDays: 5,
        showcase: [slot('featured', 2)],
    }),
    product({
        id: '6808dad9fdc77f4147b302a6', // FeaturedProducts.laptops[1]
        name: 'Lenovo Legion Pro 7i',
        brand: 'Lenovo',
        price: 1899,
        description:
            'Legion ColdFront 5.0 cooling with a 99.9 Wh battery and a 16-inch 165 Hz panel. The per-key RGB keyboard has genuine 1.5 mm travel, which is rare at this thickness.',
        tags: ['Laptops', 'Gaming'],
        variants: [{ name: 'Storage', options: ['1TB', '2TB'] }],
        inventory: { '1TB': 8, '2TB': 3 },
        ageDays: 14,
        showcase: [slot('featured', 3)],
    }),
    product({
        id: '6808dbe6cf07408f2114c2e7', // FeaturedProducts.laptops[2]
        name: 'Dell XPS 15',
        brand: 'Dell',
        price: 1749,
        description:
            'A machined aluminium 15-inch workstation with a 3.5K OLED option and an edge-to-edge keyboard. Ships with a 90 W USB-C adapter that also charges a phone.',
        tags: ['Laptops'],
        // Hyphenated on both axes — the worst case for the current key encoding.
        variants: [{ name: 'Configuration', options: ['i7-32GB', 'i9-64GB'] }],
        inventory: { 'i7-32GB': 5, 'i9-64GB': 1 },
        ageDays: 21,
        showcase: [slot('featured', 4)],
    }),
    product({
        id: '6808dcbb34c8892e5062bd27', // FeaturedProducts.laptops[3]
        name: 'HP Omen Transcend 14',
        brand: 'HP',
        price: 1599,
        description:
            'A 1.63 kg gaming laptop with an OLED 120 Hz display and a single configuration — no options to weigh up, which is the point.',
        tags: ['Laptops', 'Gaming'],
        // Variant-less.
        variants: [],
        inventory: { [VARIANT_LESS_KEY]: 6 },
        ageDays: 28,
        showcase: [slot('featured', 5)],
    }),

    // ---- Gaming PCs -------------------------------------------------------
    product({
        id: '6808c03e1ddc34906b982f3b', // FeaturedProducts.pcs[0]
        name: 'Netronix Apex Battlestation',
        brand: 'Netronix',
        price: 3299,
        description:
            'Our flagship build: liquid-cooled Core Ultra 9, 1000 W platinum PSU, and cable management done properly. Assembled and stress-tested in Beirut before it ships.',
        tags: ['Gaming PCs', 'Gaming'],
        variants: [
            { name: 'GPU', options: ['RTX-4080', 'RTX-4090'] },
            { name: 'Storage', options: ['1TB', '2TB'] },
        ],
        inventory: { 'RTX-4080-1TB': 4, 'RTX-4080-2TB': 2, 'RTX-4090-1TB': 1, 'RTX-4090-2TB': 0 },
        bestSeller: true,
        ageDays: 7,
        showcase: [slot('featured', 6)],
    }),
    product({
        id: '6808beb09557fb4c91563b03', // FeaturedProducts.pcs[1]
        name: 'Netronix Vortex Creator PC',
        brand: 'Netronix',
        price: 2450,
        description:
            'Tuned for timeline scrubbing rather than frame rates: 64 GB of RAM, two NVMe slots populated, and a case with acoustic foam on every panel.',
        tags: ['Gaming PCs'],
        variants: [{ name: 'GPU', options: ['RTX-4070', 'RTX-4080'] }],
        inventory: { 'RTX-4070': 5, 'RTX-4080': 2 },
        ageDays: 11,
        showcase: [slot('featured', 7)],
    }),
    product({
        id: '6808bda4316fe0e95f32e6a7', // FeaturedProducts.pcs[2]
        name: 'Netronix Nova Starter PC',
        brand: 'Netronix',
        price: 899,
        description:
            'An honest entry-level build. 1080p high settings in most titles, room for one more drive, and a PSU with enough headroom to survive a GPU upgrade.',
        tags: ['Gaming PCs'],
        variants: [{ name: 'RAM', options: ['16GB', '32GB'] }],
        inventory: { '16GB': 1, '32GB': 1 }, // single-unit across the board
        ageDays: 18,
        showcase: [slot('featured', 8)],
    }),
    product({
        id: '680898020051b67b74d7ab7c', // FeaturedProducts.pcs[3]
        name: 'Corsair One i500',
        brand: 'Corsair',
        price: 3799,
        description:
            'A 12-litre chassis containing a full desktop GPU, liquid cooling on both the CPU and the graphics card, and no configuration choices whatsoever.',
        tags: ['Gaming PCs'],
        variants: [],
        inventory: { [VARIANT_LESS_KEY]: 2 },
        ageDays: 24,
        showcase: [slot('featured', 9)],
    }),

    // ---- Shop the Look ----------------------------------------------------
    product({
        id: '6808d7d6cb9e1085777db07c', // ShopTheLook.keyboard
        name: 'Keychron Q3 Max',
        brand: 'Keychron',
        price: 219,
        description:
            'A gasket-mounted 80% board in full aluminium, hot-swappable, with a double-gasket design that removes the hollow sound most tenkeyless boards have.',
        tags: ['Accessories', 'Gaming'],
        variants: [
            { name: 'Switch', options: ['Gateron-Red', 'Gateron-Brown'] },
            { name: 'Layout', options: ['ANSI', 'ISO'] },
        ],
        inventory: { 'Gateron-Red-ANSI': 12, 'Gateron-Red-ISO': 4, 'Gateron-Brown-ANSI': 7, 'Gateron-Brown-ISO': 0 },
        ageDays: 16,
        showcase: [slot('shop-the-look', 3)],
    }),
    product({
        id: '6808e09934c8892e5062bd3b', // ShopTheLook.headset
        name: 'SteelSeries Arctis Nova Pro',
        brand: 'SteelSeries',
        price: 349,
        description:
            'Hot-swap dual batteries mean the headset never needs to be plugged in to keep working. Active noise cancellation and a retractable mic that is genuinely broadcast-usable.',
        tags: ['Headphones', 'Gaming'],
        variants: [{ name: 'Colour', options: ['Black', 'White'] }],
        inventory: { Black: 10, White: 3 },
        bestSeller: true,
        ageDays: 12,
        showcase: [slot('shop-the-look', 2)],
    }),
    product({
        id: '6809028550ea8406eae4b442', // ShopTheLook.monitor
        name: 'LG UltraGear 27" OLED',
        brand: 'LG',
        price: 899,
        description:
            'A 1440p OLED at 240 Hz with a 0.03 ms response time. The anti-glare coating is the reason to pick this one over the glossy alternatives.',
        tags: ['Accessories', 'Gaming'],
        variants: [{ name: 'Refresh Rate', options: ['240Hz', '480Hz'] }],
        inventory: { '240Hz': 6, '480Hz': 1 },
        ageDays: 6,
        showcase: [slot('shop-the-look', 0)],
    }),

    // ---- Hero video / featured single product -----------------------------
    product({
        id: '680262846be92b2511550a66', // FeaturedProduct.jsx + HeroVideo.jsx
        name: 'Razer Cobra Pro',
        brand: 'Razer',
        price: 129.99,
        description:
            'A 77 g wireless mouse with optical switches rated to 90 million clicks and Chroma lighting on the underglow. Charges over USB-C or on the optional dock.',
        tags: ['Accessories', 'Gaming'],
        variants: [{ name: 'Colour', options: ['Black', 'White'] }],
        inventory: { Black: 15, White: 8 },
        bestSeller: true,
        ageDays: 2,
        showcase: [slot('featured-product', 0), slot('hero-video', 0)],
    }),

    // ---- Chatbot fallback id ----------------------------------------------
    product({
        id: '65f3c0d2e5c25ad8e9a3ca01', // ChatInterface.jsx:24 fallback link target
        name: 'Anker Prime 27K Power Bank',
        brand: 'Anker',
        price: 179,
        description:
            'A 27,650 mAh bank that pushes 250 W across three ports and shows per-port draw on a small display. Airline-legal, just.',
        tags: ['Accessories'],
        variants: [],
        inventory: { [VARIANT_LESS_KEY]: 11 },
        ageDays: 33,
    }),

    // ---- Catalog breadth: one product per remaining Slider category -------
    product({
        id: seededId(16),
        name: 'Sony WH-1000XM6',
        brand: 'Sony',
        price: 429,
        description:
            'The noise cancelling benchmark. Thirty hours per charge, multipoint to two devices, and a case that finally folds flat again.',
        tags: ['Headphones'],
        variants: [{ name: 'Colour', options: ['Black', 'Platinum-Silver'] }],
        inventory: { Black: 14, 'Platinum-Silver': 5 },
        bestSeller: true,
        ageDays: 4,
    }),
    product({
        id: seededId(17),
        name: 'Sennheiser Momentum True Wireless 4',
        brand: 'Sennheiser',
        price: 299,
        description:
            'aptX Lossless earbuds with a genuinely neutral tuning. The fit kit includes four ear-tip sizes and two sets of fins.',
        tags: ['Earphones'],
        variants: [],
        // Fully out of stock — exercises the sold-out path end to end.
        inventory: { [VARIANT_LESS_KEY]: 0 },
        ageDays: 19,
    }),
    product({
        id: seededId(18),
        name: 'Sonos Era 300',
        brand: 'Sonos',
        price: 499,
        description:
            'Six drivers arranged to fire up and sideways for spatial audio that works without a soundbar. Line-in over USB-C with the adapter.',
        tags: ['Speakers'],
        variants: [{ name: 'Finish', options: ['Black', 'White'] }],
        inventory: { Black: 6, White: 4 },
        ageDays: 26,
    }),
    product({
        id: seededId(19),
        name: 'Logitech MX Master 4',
        brand: 'Logitech',
        price: 119,
        description:
            'The mouse most people settle on eventually. MagSpeed wheel, per-application button mapping, and it tracks on glass.',
        tags: ['Accessories'],
        variants: [],
        inventory: { [VARIANT_LESS_KEY]: 1 }, // single unit, no variants
        ageDays: 30,
    }),
    product({
        id: seededId(20),
        name: 'Elgato Stream Deck XL',
        brand: 'Elgato',
        price: 249,
        description:
            'Thirty-two LCD keys and a profile system that switches automatically with the focused application. The stand tilts far enough to sit under a monitor arm.',
        tags: ['Gaming', 'Accessories'],
        variants: [],
        inventory: { [VARIANT_LESS_KEY]: 5 },
        ageDays: 36,
    }),
]

// ---------------------------------------------------------------------------
// Users
//
// One demo customer only.
//
// There is deliberately NO demo admin user, and that is now a different
// decision from the one Phase 0 made.
//
// Phase 0's reason was that a `role: 'admin'` document would have granted
// nothing: `adminLogin` compared against ADMIN_EMAIL / ADMIN_PASSWORD from the
// environment and never consulted the users collection (SEC-001). That is no
// longer true — the admin *is* a user document now.
//
// The reason it is still absent is simpler: seeding an administrator means
// seeding a known password into a known account, and the seed's whole design
// is that its output is fixed and reproducible. An admin created that way is a
// published credential. `npm run create-admin` exists instead: it prompts for a
// password without echoing it and refuses any non-local target.
// ---------------------------------------------------------------------------

export const DEMO_CUSTOMER_ID = '5eed00000000000000000001'
export const DEMO_CUSTOMER_EMAIL = 'demo@netronix.test'

export const users = [
    {
        _id: DEMO_CUSTOMER_ID,
        name: 'Demo Customer',
        email: DEMO_CUSTOMER_EMAIL,
        // Hash is computed by the seed from DEMO_CUSTOMER_PASSWORD + DEMO_BCRYPT_SALT.
        cartData: {
            '6808d9f6c448f5e2e77e997e': { Midnight: 1 },
            '680262846be92b2511550a66': { Black: 2 },
        },
        wishlist: ['680897a3a9a5ffb06b2e52c8', '6809028550ea8406eae4b442'],
    },
]

// ---------------------------------------------------------------------------
// Orders
//
// Item shape matches what the checkout actually posts today —
// `{ productId, size, quantity }`, where `size` is the joined variant key
// (ARCH-003). Orders store no product name or price snapshot (DB-005); both
// listing endpoints re-read the current product to fill those in, which is the
// bug that makes order history mutable. The seed reproduces the real shape
// rather than a corrected one.
//
// Covers every status the admin UI offers, both guest and authenticated.
// ---------------------------------------------------------------------------

const ORDER_EPOCH = Date.UTC(2026, 7, 10, 9, 30, 0) // 2026-08-10T09:30:00Z

const address = (overrides = {}) => ({
    firstName: 'Demo',
    lastName: 'Customer',
    email: DEMO_CUSTOMER_EMAIL,
    street: '124 Rue Gouraud, Gemmayzeh',
    city: 'Beirut',
    state: 'Beirut Governorate',
    zipcode: '2022',
    country: 'Lebanon',
    phone: '+961 71 000 000',
    ...overrides,
})

const DELIVERY_FEE = 3 // matches ShopContext.jsx:10

function order({ n, status, userId, items, subtotal, ageHours, addressOverrides }) {
    return {
        _id: `5eed0000000000000000${String(0x1000 + n).toString(16)}`,
        orderNumber: 1000 + n,
        userId: userId ?? undefined,
        items,
        subtotal,
        delivery_fee: DELIVERY_FEE,
        amount: Number((subtotal + DELIVERY_FEE).toFixed(2)),
        address: address(addressOverrides),
        status,
        paymentMethod: 'COD',
        payment: status === 'Delivered',
        date: new Date(ORDER_EPOCH - ageHours * 60 * 60 * 1000),
        isGuestOrder: !userId,
    }
}

export const orders = [
    // Authenticated — one per status.
    order({
        n: 0,
        status: 'Order Placed',
        userId: DEMO_CUSTOMER_ID,
        items: [{ productId: '680262846be92b2511550a66', size: 'Black', quantity: 1 }],
        subtotal: 129.99,
        ageHours: 2,
    }),
    order({
        n: 1,
        status: 'Packing',
        userId: DEMO_CUSTOMER_ID,
        items: [
            { productId: '6808d7d6cb9e1085777db07c', size: 'Gateron-Red-ANSI', quantity: 1 },
            { productId: seededId(19), size: '', quantity: 1 },
        ],
        subtotal: 338,
        ageHours: 30,
    }),
    order({
        n: 2,
        status: 'Shipped',
        userId: DEMO_CUSTOMER_ID,
        items: [{ productId: '6808e09934c8892e5062bd3b', size: 'Black', quantity: 1 }],
        subtotal: 349,
        ageHours: 74,
    }),
    order({
        n: 3,
        status: 'Out for Delivery',
        userId: DEMO_CUSTOMER_ID,
        items: [{ productId: '680897a3a9a5ffb06b2e52c8', size: '16-inch-1TB', quantity: 1 }],
        subtotal: 2499,
        ageHours: 120,
    }),
    order({
        n: 4,
        status: 'Delivered',
        userId: DEMO_CUSTOMER_ID,
        items: [{ productId: '6808dcbb34c8892e5062bd27', size: '', quantity: 1 }],
        subtotal: 1599,
        ageHours: 400,
    }),

    // Guest — the statuses a guest order realistically reaches.
    order({
        n: 5,
        status: 'Order Placed',
        userId: null,
        items: [{ productId: seededId(16), size: 'Black', quantity: 1 }],
        subtotal: 429,
        ageHours: 6,
        addressOverrides: { firstName: 'Rana', lastName: 'Haddad', email: 'rana.haddad@example.test', city: 'Jounieh' },
    }),
    order({
        n: 6,
        status: 'Shipped',
        userId: null,
        items: [
            { productId: seededId(18), size: 'White', quantity: 2 },
            { productId: seededId(20), size: '', quantity: 1 },
        ],
        subtotal: 1247,
        ageHours: 96,
        addressOverrides: { firstName: 'Karim', lastName: 'Aoun', email: 'karim.aoun@example.test', city: 'Tripoli' },
    }),
    order({
        n: 7,
        status: 'Delivered',
        userId: null,
        items: [{ productId: '6808bda4316fe0e95f32e6a7', size: '32GB', quantity: 1 }],
        subtotal: 899,
        ageHours: 640,
        addressOverrides: { firstName: 'Maya', lastName: 'Khoury', email: 'maya.khoury@example.test', city: 'Zahle' },
    }),
    order({
        n: 8,
        status: 'Packing',
        userId: null,
        items: [{ productId: '6809028550ea8406eae4b442', size: '240Hz', quantity: 1 }],
        subtotal: 899,
        ageHours: 52,
        addressOverrides: { firstName: 'Elias', lastName: 'Nassar', email: 'elias.nassar@example.test', city: 'Byblos' },
    }),
    order({
        n: 9,
        status: 'Out for Delivery',
        userId: null,
        items: [{ productId: '6808dad9fdc77f4147b302a6', size: '1TB', quantity: 1 }],
        subtotal: 1899,
        ageHours: 80,
        addressOverrides: { firstName: 'Lea', lastName: 'Sfeir', email: 'lea.sfeir@example.test', city: 'Saida' },
    }),
]

/**
 * Every product this catalog assigns to a homepage surface (FE-004).
 *
 * Derived from the fixtures rather than listed by hand, so it cannot fall out of
 * step with them. It exists for the seed's own summary — "did every showcase
 * slot end up with a product?" — and no longer for any component: nothing reads
 * a product id by literal any more.
 */
export const SHOWCASE_PRODUCT_IDS = Object.freeze(
    products.filter((p) => p.showcase.length > 0).map((p) => p._id),
)

/** Which products the seed puts in each slot, in the order they will appear. */
export const SHOWCASE_BY_SLOT = Object.freeze(
    Object.fromEntries(
        [...new Set(products.flatMap((p) => p.showcase.map((entry) => entry.slot)))].map((name) => [
            name,
            Object.freeze(
                products
                    .filter((p) => p.showcase.some((entry) => entry.slot === name))
                    .sort((a, b) =>
                        a.showcase.find((e) => e.slot === name).order -
                        b.showcase.find((e) => e.slot === name).order)
                    .map((p) => p._id),
            ),
        ]),
    ),
)

/** The tag taxonomy the storefront's category slider expects. */
export const EXPECTED_TAGS = Object.freeze([
    'Laptops', 'Gaming PCs', 'MacBooks', 'Headphones', 'Earphones', 'Speakers', 'Accessories', 'Gaming',
])

export { CATALOG_EPOCH, seededId }
