// Rules the product form applies, separated from the component that renders it.
//
// They live here rather than beside `ProductForm` for two reasons. A rule that
// can be tested without mounting a form is a rule that gets tested — `Add.jsx`
// was 619 lines with all of this inlined, which is how ADM-005 and ADM-009 both
// went unnoticed. And exporting non-components from a component module breaks
// Fast Refresh, which the lint config reports (TEST-002).

import { buildCombinations } from './variant'

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

/** The `accept` attribute for every image input. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(',')

/**
 * ADM-013 / SEC-008 — the client half of upload hardening.
 *
 * The file inputs had no `accept`, no size check and no type check, so the first
 * thing that told an admin their 40 MB RAW photo was unusable was a failed
 * request after the whole file had been sent. The server enforces all of this
 * too (`middleware/multer.js`); this is the fast, legible half of the same rule.
 *
 * @returns {string|null} A message to show, or null when the file is fine.
 */
export const describeImageProblem = (file) => {
    if (!file) return null
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        return `${file.name || 'That file'} is not a PNG, JPEG or WebP image`
    }
    if (file.size > MAX_IMAGE_BYTES) {
        return `${file.name || 'That image'} is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 5 MB`
    }
    return null
}

/**
 * ADM-009 — the price rule, stated once.
 *
 * The server rejects a non-positive or non-numeric price with a 400. The input
 * also carries `min`/`step`, so a browser blocks most bad values before any of
 * this runs — but constraint attributes are trivially bypassed and say nothing
 * about a programmatic submit, so the check exists in JavaScript too.
 *
 * @returns {string|null} A message to show, or null when the price is fine.
 */
export const describePriceProblem = (value) => {
    const numeric = Number(value)
    if (value === '' || value === null || value === undefined || !Number.isFinite(numeric) || numeric <= 0) {
        return 'Price must be a number greater than zero'
    }
    return null
}

/**
 * Every combination the declared axes generate, as `{ axis: value }` objects.
 *
 * This is the whole of ADM-005's fix: the matrix is a *function of* the variant
 * axes, so it cannot disagree with them. The previous implementation mirrored it
 * into a second piece of state and reconciled the two by hand, from a stale
 * closure, after mutating the first one in place.
 *
 * An axis with no options yet generates nothing, because a Cartesian product
 * with an empty set is empty — the matrix appears when the axes can produce one.
 */
export function combinationsOf(variants) {
    if (!Array.isArray(variants)) return []
    if (variants.length === 0) return buildCombinations([])
    if (variants.some((variant) => !variant?.options?.length)) return []
    return buildCombinations(variants)
}
