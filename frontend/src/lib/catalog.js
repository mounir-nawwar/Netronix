// Pure catalog filtering and sorting (FE-003, FE-010).
//
// The defect
// ----------
// `Collections.jsx` filtered and sorted on **fields the schema has never had**.
// Four of them, on one page:
//
//   * `item.category` for the collection route, so `/collections/laptops`
//     matched nothing and every typed collection rendered empty;
//   * the same field for the sidebar's checkbox list, which was therefore always
//     empty too;
//   * `a.createdAt` for "newest", which is `undefined` on every product, so the
//     sort compared `new Date(0)` with `new Date(0)` and did nothing;
//   * `useState([0, 1000])` with `/1000` hardcoded into the slider geometry, so
//     **nothing over $1,000 was ever shown** — on the page the empty cart's own
//     call to action links to, in a catalog whose laptops start at $1,149.
//
// Products are categorised by `tags`. "Newest" is `date`, a `Number` of epoch
// milliseconds. The price ceiling is a property of the catalog, not a constant.
//
// These are pure functions taking data and returning data, in their own module,
// because a filter that can be tested without mounting a 650-line page is a
// filter that gets tested.

/** Case-insensitive tag match. `/collections/gaming` must find `Gaming`. */
export function hasTag(product, tag) {
    if (!tag) return true
    const wanted = String(tag).toLowerCase()
    return (Array.isArray(product?.tags) ? product.tags : [])
        .some((candidate) => String(candidate).toLowerCase() === wanted)
}

/** The price a filter compares against, in major units. */
export function priceOf(product) {
    const minor = Number(product?.priceMinor)
    if (Number.isFinite(minor)) return minor / 100
    const major = Number(product?.price)
    return Number.isFinite(major) ? major : 0
}

/**
 * The highest price in the catalog, rounded up to a round number.
 *
 * Rounded so the slider's maximum is a legible figure rather than $2,499.99, and
 * derived so that a catalog whose most expensive product is $12,000 has a slider
 * that reaches it. `fallback` is used only for an empty catalog, where there is
 * no maximum to derive.
 */
export function catalogPriceCeiling(products, fallback = 1000) {
    const prices = (Array.isArray(products) ? products : []).map(priceOf).filter(Number.isFinite)
    if (prices.length === 0) return fallback

    const highest = Math.max(...prices)
    if (highest <= 0) return fallback
    return highest <= 1000
        ? Math.ceil(highest / 100) * 100
        : Math.ceil(highest / 1000) * 1000
}

/** Every tag the catalog actually uses, sorted. Never an invented list (FE-010). */
export function tagsOf(products) {
    const tags = new Set()
    for (const product of Array.isArray(products) ? products : []) {
        for (const tag of Array.isArray(product?.tags) ? product.tags : []) {
            if (typeof tag === 'string' && tag.trim() !== '') tags.add(tag)
        }
    }
    return [...tags].sort()
}

/**
 * Apply the Collections page's filters.
 *
 * @param {object[]} products
 * @param {{type?: string, priceRange?: [number, number], tags?: string[]}} filters
 */
export function filterProducts(products, { type, priceRange, tags = [] } = {}) {
    const [minimum, maximum] = Array.isArray(priceRange) ? priceRange : [0, Infinity]

    return (Array.isArray(products) ? products : []).filter((product) => {
        if (!product) return false

        // `all` is the whole catalog; anything else is a tag.
        if (type && type !== 'all' && !hasTag(product, type)) return false

        const price = priceOf(product)
        if (price < minimum || price > maximum) return false

        if (tags.length > 0 && !tags.some((tag) => hasTag(product, tag))) return false

        return true
    })
}

/** The sort orders the page offers. `newest` is `date`, descending. */
export function sortProducts(products, sortBy) {
    const sorted = [...(Array.isArray(products) ? products : [])]

    switch (sortBy) {
        case 'price-low':
            return sorted.sort((a, b) => priceOf(a) - priceOf(b))
        case 'price-high':
            return sorted.sort((a, b) => priceOf(b) - priceOf(a))
        case 'name-asc':
            return sorted.sort((a, b) => String(a?.name ?? '').localeCompare(String(b?.name ?? '')))
        case 'name-desc':
            return sorted.sort((a, b) => String(b?.name ?? '').localeCompare(String(a?.name ?? '')))
        case 'newest':
        default:
            // `date: Number`, epoch milliseconds. Ties break on `_id` so the
            // order is total and does not shuffle between renders.
            return sorted.sort((a, b) => {
                const difference = Number(b?.date ?? 0) - Number(a?.date ?? 0)
                if (difference !== 0) return difference
                return String(a?._id ?? '').localeCompare(String(b?._id ?? ''))
            })
    }
}

/**
 * The storefront's product search, as a predicate.
 *
 * Lifted unchanged from `AllProducts` so it can be tested and so the two browse
 * surfaces stop maintaining two different answers to "does this match?".
 */
export function matchesSearch(product, term) {
    const search = String(term ?? '').toLowerCase().trim()
    if (search === '') return true

    const name = String(product?.name ?? '').toLowerCase()
    const brand = String(product?.brand ?? '').toLowerCase()

    // A one- or two-character term matches too much to be useful as a fuzzy
    // search, so it is required to be a substring of the name or the exact brand.
    if (search.length < 3) return name.includes(search) || brand === search

    const nameMatch = name.split(/\s+/).some((word) => word.includes(search) || search.includes(word))
    const descriptionMatch = String(product?.description ?? '')
        .toLowerCase()
        .split(/[,.;:!?-]\s*/)
        .some((phrase) => phrase.includes(search))
    const brandMatch = brand.includes(search)
    const tagMatch = (Array.isArray(product?.tags) ? product.tags : [])
        .some((tag) => String(tag).toLowerCase() === search)

    return nameMatch || descriptionMatch || brandMatch || tagMatch
}

/**
 * The one image URL to render, from either shape the data can be in.
 *
 * A **catalog** product carries `image` as an array of URLs. An **order line**
 * carries it as a single string — that is what `orderService` writes and what
 * migration 002 backfilled: `Array.isArray(product.image) ? product.image[0] :
 * product.image`. `Orders.jsx` kept reading `item.image[0]`, which on a string
 * is its first *character*, so every line in the storefront's order history
 * requested a one-character image and the truthiness guard hid it by passing.
 *
 * Accepting both is the compatibility contract for the whole rollout: an order
 * written before the migration may still hold the array.
 *
 * @param {string|string[]|unknown} value
 * @returns {string} a usable URL, or '' when there is none
 */
export function firstImage(value) {
    if (Array.isArray(value)) {
        return value.find((entry) => typeof entry === 'string' && entry.trim() !== '') ?? ''
    }
    return typeof value === 'string' && value.trim() !== '' ? value : ''
}
