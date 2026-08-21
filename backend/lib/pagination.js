// Bounded pagination for every list endpoint (BE-009, BE-002, DB-006).
//
// Every list endpoint returned its entire collection: the whole catalog on every
// storefront page load, and — for the admin — every order that has ever been
// placed, each of them then re-reading a product document per line.
//
// Two things have to be true at once here, and they pull against each other:
//
//   * a page must be bounded, and the sort must be deterministic, or "page 2"
//     is meaningless;
//   * the storefront and the admin console that are deployed *today* read
//     `response.data.products` / `.orders` as a plain array, and Phase 2 must
//     not break them (Phase 3 owns the API-client refactor).
//
// So the envelope is additive. `{ success, products, ... }` keeps its array
// under the name the current clients already use, and gains `items`, `total`,
// `page`, `pages` and `limit` alongside it. An old client sees the array it
// expects; a new one reads the envelope. The default limit is deliberately
// generous for the same reason — a client that sends no `page` or `limit` still
// receives a whole small catalog.

export const DEFAULT_PAGE = 1
export const DEFAULT_LIMIT = 100
export const MAX_LIMIT = 100

/**
 * Turn validated `{ page, limit }` into `{ skip, limit, page }`.
 * The validator has already rejected anything non-integer or out of range;
 * this only applies the defaults.
 */
export function resolvePaging({ page, limit } = {}) {
    const resolvedPage = Number.isSafeInteger(page) && page >= 1 ? page : DEFAULT_PAGE
    const resolvedLimit = Number.isSafeInteger(limit) && limit >= 1
        ? Math.min(limit, MAX_LIMIT)
        : DEFAULT_LIMIT
    return { page: resolvedPage, limit: resolvedLimit, skip: (resolvedPage - 1) * resolvedLimit }
}

/**
 * Build the response envelope.
 *
 * @param {string} legacyKey The field name the deployed clients already read.
 */
export function paginated(legacyKey, items, { total, page, limit }) {
    return {
        success: true,
        [legacyKey]: items,
        items,
        total,
        page,
        limit,
        pages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
    }
}
