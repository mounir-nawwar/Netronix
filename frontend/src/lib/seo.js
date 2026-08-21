// SEO-001 … SEO-005 — the site's metadata vocabulary, in one place.
//
// Two rules govern everything here, and they are the reason this is a module
// rather than strings scattered through the pages:
//
//   1. **Nothing is invented.** Product structured data comes from the catalog
//      document and nowhere else. There is no `AggregateRating`, no
//      `reviewCount`, no `priceValidUntil`, no `Organization.address` and no
//      `telephone`, because this project has no reviews, no price schedule and
//      no premises. Emitting them would make the shop's search appearance a
//      lie that Google would happily repeat.
//   2. **The origin is configuration.** Every absolute URL is built from
//      `VITE_FRONTEND_URL`, with a documented loopback default. No production
//      hostname is hardcoded anywhere in this repository.

import { frontendUrl } from '../config'

/**
 * The canonical origin.
 *
 * `VITE_FRONTEND_URL` when set; otherwise the browser's own origin, which is
 * correct for a local run and for any deployment that forgets to set it —
 * unlike a placeholder domain, which would be confidently wrong.
 */
export function origin() {
    if (frontendUrl) return frontendUrl.replace(/\/+$/, '')
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
    return 'http://localhost:5173'
}

export const absolute = (path = '/') => `${origin()}${path.startsWith('/') ? path : `/${path}`}`

export const SITE_NAME = 'Netronix'
export const TITLE_SUFFIX = ' — Netronix'

/** The one truthful sentence about what this shop is. */
export const SITE_DESCRIPTION =
    'Netronix is a computer and gaming hardware store: laptops, MacBooks, gaming PCs, ' +
    'components, headphones, speakers and accessories, with variant-level stock and ' +
    'cash-on-delivery or Whish checkout.'

export const THEME_COLOR = '#6a5acd'

/** 1200×630, generated locally from the brand identity — `scripts/make-og-image.mjs`. */
export const OG_IMAGE_PATH = '/og/netronix-og.png'
export const OG_IMAGE_ALT = 'Netronix — next-gen tech, delivered'

/** Routes a crawler has no business indexing. */
export const PRIVATE_ROUTES = ['/cart', '/placeorder', '/orders', '/wishlist', '/login']

/** The public routes a sitemap can name without build-time catalog data. */
export const PUBLIC_STATIC_ROUTES = ['/', '/products', '/collections', '/about', '/contact']

export const siteDefaults = () => ({
    title: 'Netronix — Next-Gen Tech, Delivered',
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    themeColor: THEME_COLOR,
    locale: 'en_US',
    image: absolute(OG_IMAGE_PATH),
    imageAlt: OG_IMAGE_ALT,
    canonical: absolute('/'),
    ogType: 'website',
    twitterCard: 'summary_large_image',
})

export const pageTitle = (name) => (name ? `${name}${TITLE_SUFFIX}` : siteDefaults().title)

/** `noindex` for the routes above; everything else is indexable. */
export const robotsFor = (path) =>
    (PRIVATE_ROUTES.some((route) => path === route || path.startsWith(`${route}/`))
        ? 'noindex, nofollow'
        : undefined)

// ---------------------------------------------------------------------------
// JSON-LD

/**
 * `Organization` for the homepage.
 *
 * Name, URL and logo. That is everything this project can state as fact — it
 * has no postal address, no phone number and no verified social profiles, so
 * it claims none.
 */
export const organizationLd = () => ({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: absolute('/'),
    logo: absolute(OG_IMAGE_PATH),
})

export const websiteLd = () => ({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: absolute('/'),
    potentialAction: {
        '@type': 'SearchAction',
        target: {
            '@type': 'EntryPoint',
            urlTemplate: `${absolute('/products')}?search={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
    },
})

/**
 * `Product` + `Offer` from a catalog document.
 *
 * `availability` is derived from the typed inventory the product actually
 * carries, and `price` from the minor-unit field the money layer owns — not
 * from a hardcoded "InStock", which is the usual shortcut and is a claim about
 * something the schema already knows.
 */
export function productLd(product, { currency = 'USD', priceMinor, inStock } = {}) {
    if (!product?._id) return null

    const images = Array.isArray(product.image)
        ? product.image.filter((url) => typeof url === 'string' && url.trim() !== '')
        : []

    const block = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        '@id': absolute(`/product/${product._id}`),
        name: product.name,
        url: absolute(`/product/${product._id}`),
    }

    if (product.description) block.description = product.description
    if (images.length > 0) block.image = images
    if (product.brand) block.brand = { '@type': 'Brand', name: product.brand }
    if (product.sku) block.sku = product.sku

    if (Number.isFinite(priceMinor) && priceMinor > 0) {
        block.offers = {
            '@type': 'Offer',
            url: absolute(`/product/${product._id}`),
            priceCurrency: currency,
            price: (priceMinor / 100).toFixed(2),
            availability: inStock
                ? 'https://schema.org/InStock'
                : 'https://schema.org/OutOfStock',
        }
    }

    return block
}

/** `BreadcrumbList` from a list of `{ name, path }`, in order. */
export function breadcrumbLd(trail) {
    if (!Array.isArray(trail) || trail.length === 0) return null
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((crumb, index) => ({
            '@type': 'ListItem',
            position: index + 1,
            name: crumb.name,
            item: absolute(crumb.path),
        })),
    }
}
