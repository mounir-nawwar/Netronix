// ---------------------------------------------------------------------------
// MIRROR of `backend/lib/variant.js`. Keep the two byte-identical below this line.
//
// There is no shared package in this repository (ARCH-004). The five variant
// consumers named in DB-003 live in three applications, and the whole defect was
// that each of them re-implemented encode/decode slightly differently. One
// implementation, copied verbatim, with `src/test/lib/variant.contract.test.js`
// running the same table of cases as the backend's, is the smallest thing that
// actually prevents that.
// ---------------------------------------------------------------------------
// Lossless variant identity (DB-003, ARCH-002, ARCH-003).
//
// The defect
// ----------
// A combination was identified by `optionValues.join('-')` and recovered by
// `key.split('-')`. Nothing ever checked an option value for a hyphen, and this
// is a computer-hardware catalog: `16-inch`, `RTX-4090`, `Wi-Fi 6E`, `USB-C`.
// The encoding is not injective, so two different combinations can produce the
// same key, and the decoder cannot recover the values that produced one. The
// storefront's `isOutOfStock` guard compared segment counts and failed **open**,
// rendering an unavailable combination as purchasable.
//
// The representation
// ------------------
// A combination is an unordered set of `axis → value` pairs. That is the thing
// with meaning; a string is only ever a transport for it. So the durable shape
// is a typed entry:
//
//   { variantId, legacyKey, options: Map<string,string>, quantity: int >= 0, sku? }
//
//   * `options`   — the truth. Nothing is joined, so nothing has to be split.
//   * `variantId` — a canonical, *escaped*, order-independent string identity.
//                   Two entries have the same id if and only if they have the
//                   same pairs. It is what queries and comparisons use.
//   * `legacyKey` — the old hyphen-joined string, stored so that a client, a
//                   cart, or an order line written against the old contract
//                   still resolves during the rollout. It is a compatibility
//                   field, never an identity.
//
// Rollout
// -------
// Additive. `product.inventory` — the untyped `{ "Black-512GB": 4 }` bag — is
// kept and kept in sync. Nothing in Phase 2 drops it.
//
// Ambiguity
// ---------
// A legacy key can be genuinely ambiguous: axes `["16-inch","16"] × ["1TB","inch-1TB"]`
// produce `"16-inch-1TB"` twice. There is no algorithmic answer, so this module
// never guesses. `deriveInventoryV2` marks the affected entries `needsReview`
// and reports the keys; `resolveByLegacyKey` refuses an ambiguous key rather
// than picking one. New records, written through `options`, are never ambiguous.
//
// This module is mirrored in `frontend/src/lib/variant.js` and
// `admin/src/lib/variant.js`. There is no shared package (ARCH-004); each copy
// carries the same contract test over the same table of cases.

/** Axis names and option values are bounded and may not carry Mongo path syntax. */
export const MAX_AXIS_NAME_LENGTH = 60
export const MAX_OPTION_VALUE_LENGTH = 60
export const MAX_AXES = 10

/** The delimiter the legacy encoding used, and still uses for `legacyKey`. */
export const LEGACY_DELIMITER = '-'

const PAIR_SEPARATOR = ';'
const KEY_VALUE_SEPARATOR = '='
const ESCAPE = '\\'

/** Escape the three characters the canonical encoding gives meaning to. */
function escapeSegment(value) {
    return String(value)
        .replaceAll(ESCAPE, ESCAPE + ESCAPE)
        .replaceAll(PAIR_SEPARATOR, ESCAPE + PAIR_SEPARATOR)
        .replaceAll(KEY_VALUE_SEPARATOR, ESCAPE + KEY_VALUE_SEPARATOR)
}

function unescapeSegment(value) {
    let out = ''
    for (let i = 0; i < value.length; i += 1) {
        if (value[i] === ESCAPE && i + 1 < value.length) {
            out += value[i + 1]
            i += 1
        } else {
            out += value[i]
        }
    }
    return out
}

/** Split on an unescaped separator. The inverse of `escapeSegment`'s joining. */
function splitUnescaped(input, separator) {
    const parts = []
    let current = ''
    for (let i = 0; i < input.length; i += 1) {
        const char = input[i]
        if (char === ESCAPE && i + 1 < input.length) {
            current += char + input[i + 1]
            i += 1
            continue
        }
        if (char === separator) {
            parts.push(current)
            current = ''
            continue
        }
        current += char
    }
    parts.push(current)
    return parts
}

/** Accept a Map, a Mongoose Map, or a plain object; return a plain object. */
export function toOptionsObject(options) {
    if (!options) return {}
    if (options instanceof Map) return Object.fromEntries(options.entries())
    if (typeof options.toJSON === 'function' && !Array.isArray(options)) {
        const json = options.toJSON()
        if (json && typeof json === 'object') return { ...json }
    }
    if (typeof options === 'object') return { ...options }
    return {}
}

/**
 * The canonical identity of a combination.
 *
 * Order-independent (pairs are sorted by axis name) and fully escaped, so it is
 * injective: distinct pair-sets always produce distinct strings, and the string
 * always parses back to the pairs that produced it. A product with no variants
 * has exactly one combination, whose identity is the empty string.
 */
export function canonicalVariantId(options) {
    const entries = Object.entries(toOptionsObject(options))
        .filter(([name, value]) => name !== '' && value !== undefined && value !== null && value !== '')
        .map(([name, value]) => [String(name), String(value)])
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))

    return entries
        .map(([name, value]) => `${escapeSegment(name)}${KEY_VALUE_SEPARATOR}${escapeSegment(value)}`)
        .join(PAIR_SEPARATOR)
}

/** Recover the pairs from a canonical identity. The inverse of the above. */
export function parseVariantId(variantId) {
    if (typeof variantId !== 'string' || variantId === '') return {}
    const options = {}
    for (const pair of splitUnescaped(variantId, PAIR_SEPARATOR)) {
        if (pair === '') continue
        const [rawName, ...rest] = splitUnescaped(pair, KEY_VALUE_SEPARATOR)
        options[unescapeSegment(rawName)] = unescapeSegment(rest.join(KEY_VALUE_SEPARATOR))
    }
    return options
}

/**
 * The axis name used when a product carries inventory keys but declares no
 * variants at all.
 *
 * This shape exists in the data: `{ variants: [], inventory: { Black: 5 } }`.
 * The old code tolerated it because `allowedInventoryKeys` unioned the declared
 * combinations with whatever keys happened to be present, so such a key was
 * orderable even though nothing described it. It is not a combination of no
 * axes — a product with no axes has exactly one combination, keyed `''` — it is
 * a **one-axis product whose axis name was never recorded**.
 *
 * Reading it that way keeps the data addressable and lossless rather than
 * silently discarding stock. The placeholder name is visible in the label, and
 * `variantLabel` deliberately renders the value alone for it, which is what the
 * old display code did with an unresolvable key.
 */
export const IMPLICIT_AXIS_NAME = 'Option'

/** The axes a product actually has, in declaration order. */
export function axesOf(variants) {
    return (Array.isArray(variants) ? variants : [])
        .filter((variant) => variant && typeof variant.name === 'string' && Array.isArray(variant.options) && variant.options.length > 0)
        .map((variant) => ({ name: String(variant.name), options: variant.options.map(String) }))
}

/** True when `options` is the implicit single-axis shape described above. */
function implicitValue(options) {
    const entries = Object.entries(toOptionsObject(options))
    return entries.length === 1 && entries[0][0] === IMPLICIT_AXIS_NAME ? String(entries[0][1]) : null
}

/**
 * The axes to derive combinations from: the declared ones when there are any,
 * otherwise the implicit axis recovered from the legacy bag's own keys.
 */
export function effectiveAxes(variants, inventory = {}) {
    const declared = axesOf(variants)
    if (declared.length > 0) return declared

    const keys = Object.keys(inventory && typeof inventory === 'object' ? inventory : {})
        .filter((key) => key !== '')
    if (keys.length === 0) return []
    return [{ name: IMPLICIT_AXIS_NAME, options: keys }]
}

/**
 * The legacy hyphen-joined key for a combination.
 *
 * Declaration order, not sorted order, because that is what the old encoder did
 * and the point of this function is to reproduce it exactly. A product with no
 * variants yields the empty string — which is the key the old code stored stock
 * under, and the reason `$inc: { "inventory.": -n }` was rejected by MongoDB.
 */
export function legacyVariantKey(variants, options) {
    const values = toOptionsObject(options)
    const axes = axesOf(variants)
    if (axes.length === 0) {
        // No declared axes: either the single variant-less combination, whose
        // legacy key is the empty string, or the implicit one-axis shape, whose
        // legacy key is the option value itself.
        return implicitValue(values) ?? ''
    }
    return axes.map((axis) => String(values[axis.name] ?? '')).join(LEGACY_DELIMITER)
}

/** "Size: 16-inch, Storage: 1TB" — the human label, in declaration order. */
export function variantLabel(variants, options) {
    const values = toOptionsObject(options)
    const axes = axesOf(variants)
    if (axes.length === 0) {
        // The implicit axis has no recorded name, so the value stands alone —
        // which is exactly what the old display helpers fell back to.
        return implicitValue(values) ?? ''
    }
    return axes
        .filter((axis) => values[axis.name] !== undefined && values[axis.name] !== '')
        .map((axis) => `${axis.name}: ${values[axis.name]}`)
        .join(', ')
}

/** Every combination a product's axes generate, in declaration order. */
export function buildCombinations(variants, inventory) {
    const axes = inventory === undefined ? axesOf(variants) : effectiveAxes(variants, inventory)
    if (axes.length === 0) return [{}]

    let combinations = [{}]
    for (const axis of axes) {
        const next = []
        for (const prefix of combinations) {
            for (const option of axis.options) {
                next.push({ ...prefix, [axis.name]: option })
            }
        }
        combinations = next
    }
    return combinations
}

/** One typed entry, fully derived from its options. */
export function makeEntry(variants, options, quantity = 0, extra = {}) {
    const normalised = toOptionsObject(options)
    return {
        variantId: canonicalVariantId(normalised),
        legacyKey: legacyVariantKey(variants, normalised),
        options: normalised,
        quantity: Number.isSafeInteger(quantity) && quantity >= 0 ? quantity : 0,
        ...extra,
    }
}

/**
 * Normalise a caller-supplied inventory matrix, or refuse it.
 *
 * The validator checked the *shape* of `inventoryV2` and stopped there — not
 * that each combination's canonical identity appears once, not that its option
 * values belong to a declared axis, not that the matrix covers what the axes
 * generate. Two consequences, both real:
 *
 *   * A repeated combination is read by `resolveVariant` as the **first** row
 *     and decremented by `orderService.reserve` as **every** matching row, so
 *     one unit sold took two off the shelf and the rows disagreed from then on.
 *   * An option value no axis declares produces a row nothing can ever select,
 *     holding stock that cannot be bought.
 *
 * So: every entry is canonicalised, membership is checked against the declared
 * axes, a repeat is refused rather than merged (merging would have to choose a
 * quantity, and choosing is guessing), and combinations the axes generate but
 * the caller omitted are added with zero — a hole in the matrix is not a
 * decision anyone made.
 *
 * @param {object[]} variants  declared axes
 * @param {object[]} entries   `[{ options, quantity, sku? }]`
 * @throws {VariantResolutionError} on a duplicate, an unknown axis, or an
 *         option value the axis does not declare
 * @returns {object[]} entries in the axes' own combination order
 */
export function normaliseInventoryV2(variants, entries = []) {
    const axes = axesOf(variants)
    const declared = new Map(axes.map((axis) => [axis.name, new Set(axis.options.map(String))]))

    const byId = new Map()

    for (const entry of Array.isArray(entries) ? entries : []) {
        const options = toOptionsObject(entry?.options)

        for (const [axisName, value] of Object.entries(options)) {
            if (axes.length === 0) continue
            const allowed = declared.get(axisName)
            if (!allowed) {
                throw new VariantResolutionError(
                    `"${axisName}" is not one of this product's variants`,
                    { code: 'UNKNOWN_AXIS', axis: axisName },
                )
            }
            if (!allowed.has(String(value))) {
                throw new VariantResolutionError(
                    `"${value}" is not one of the values declared for "${axisName}"`,
                    { code: 'UNKNOWN_OPTION', axis: axisName, value: String(value) },
                )
            }
        }

        const variantId = canonicalVariantId(options)
        if (byId.has(variantId)) {
            throw new VariantResolutionError(
                'the same combination is listed more than once',
                { code: 'DUPLICATE_VARIANT', variantId },
            )
        }

        byId.set(variantId, makeEntry(
            variants,
            options,
            entry?.quantity,
            entry?.sku ? { sku: entry.sku } : {},
        ))
    }

    // Complete the matrix, in the axes' own order, so the stored array is a
    // function of the axes rather than of the order a form happened to submit.
    const complete = []
    const seen = new Set()
    for (const options of buildCombinations(variants, undefined)) {
        const variantId = canonicalVariantId(options)
        seen.add(variantId)
        complete.push(byId.get(variantId) ?? makeEntry(variants, options, 0))
    }

    // Anything the caller sent that the axes do not generate has already been
    // refused above when there are axes; with no axes there is one combination
    // and this keeps it.
    for (const [variantId, entry] of byId) {
        if (!seen.has(variantId)) complete.push(entry)
    }

    return complete
}

/**
 * Derive the V2 array from a product's `variants` definition and its legacy
 * `inventory` bag.
 *
 * @returns {{ entries: object[], ambiguousKeys: string[], orphanKeys: string[] }}
 *   `ambiguousKeys` — legacy keys produced by more than one combination. The
 *   affected entries are returned with `quantity: 0` and `needsReview: true`;
 *   the legacy value is left untouched for a human to resolve.
 *   `orphanKeys` — keys present in `inventory` that no combination generates.
 *   They are reported, never deleted.
 */
export function deriveInventoryV2(variants, inventory = {}) {
    const legacy = inventory && typeof inventory === 'object' ? inventory : {}
    const combinations = buildCombinations(variants, legacy)

    const byLegacyKey = new Map()
    for (const options of combinations) {
        const key = legacyVariantKey(variants, options)
        byLegacyKey.set(key, (byLegacyKey.get(key) ?? 0) + 1)
    }
    const ambiguousKeys = [...byLegacyKey.entries()].filter(([, count]) => count > 1).map(([key]) => key)
    const ambiguous = new Set(ambiguousKeys)

    const entries = combinations.map((options) => {
        const key = legacyVariantKey(variants, options)
        if (ambiguous.has(key)) {
            // No algorithmic answer: several combinations claim this number.
            // Quarantine rather than guess (audit item 4 of the Phase 2 brief).
            return makeEntry(variants, options, 0, { needsReview: true })
        }
        const raw = legacy[key]
        const quantity = Number.isFinite(Number(raw)) ? Math.max(0, Math.trunc(Number(raw))) : 0
        return makeEntry(variants, options, quantity)
    })

    const generated = new Set(entries.map((entry) => entry.legacyKey))
    const orphanKeys = Object.keys(legacy).filter((key) => !generated.has(key))

    return { entries, ambiguousKeys, orphanKeys }
}

/** Rebuild the legacy bag from V2, preserving keys V2 does not generate. */
export function legacyInventoryFrom(entries, existing = {}) {
    const out = { ...(existing && typeof existing === 'object' ? existing : {}) }
    for (const entry of entries ?? []) {
        if (entry?.needsReview) continue // leave the human-resolvable value alone
        out[entry.legacyKey] = entry.quantity
    }
    return out
}

/** Normalise whatever shape came off a document into plain entries. */
export function entriesOf(product) {
    const raw = product?.inventoryV2
    if (!Array.isArray(raw) || raw.length === 0) return []
    return raw.map((entry) => ({
        variantId: entry.variantId ?? canonicalVariantId(entry.options),
        legacyKey: entry.legacyKey ?? '',
        options: toOptionsObject(entry.options),
        quantity: Number(entry.quantity ?? 0),
        sku: entry.sku ?? undefined,
        needsReview: Boolean(entry.needsReview),
    }))
}

export class VariantResolutionError extends Error {
    constructor(reason, { code, variantId, legacyKey } = {}) {
        super(reason)
        this.name = 'VariantResolutionError'
        this.code = code ?? 'VARIANT_UNRESOLVED'
        this.variantId = variantId
        this.legacyKey = legacyKey
    }
}

/**
 * Resolve a client-supplied variant reference against a product.
 *
 * Three accepted forms, in order of preference:
 *   1. `variantOptions` — the lossless one. `{ Size: "16-inch", Storage: "1TB" }`.
 *   2. `variantId`      — the canonical identity, if a caller already holds one.
 *   3. `variantKey`     — the legacy hyphen-joined string, for a client that has
 *                         not been redeployed. Refused when ambiguous.
 *
 * Fails **closed**: an unrecognised or ambiguous reference throws. The old
 * storefront guard did the opposite.
 */
export function resolveVariant(product, { variantOptions, variantId, variantKey } = {}) {
    const entries = entriesOf(product)
    if (entries.length === 0) {
        throw new VariantResolutionError('the product has no variant inventory', { code: 'NO_INVENTORY' })
    }

    if (variantOptions !== undefined && variantOptions !== null) {
        const wanted = canonicalVariantId(variantOptions)
        const match = entries.find((entry) => entry.variantId === wanted)
        if (match) return match
        throw new VariantResolutionError('that combination is not one this product has', {
            code: 'UNKNOWN_VARIANT', variantId: wanted,
        })
    }

    if (typeof variantId === 'string') {
        const match = entries.find((entry) => entry.variantId === variantId)
        if (match) return match
        throw new VariantResolutionError('that combination is not one this product has', {
            code: 'UNKNOWN_VARIANT', variantId,
        })
    }

    if (typeof variantKey === 'string') {
        const matches = entries.filter((entry) => entry.legacyKey === variantKey)
        if (matches.length === 1) return matches[0]
        if (matches.length > 1) {
            throw new VariantResolutionError('that option is ambiguous and cannot be resolved automatically', {
                code: 'AMBIGUOUS_VARIANT', legacyKey: variantKey,
            })
        }
        throw new VariantResolutionError('that option is not available for this product', {
            code: 'UNKNOWN_VARIANT', legacyKey: variantKey,
        })
    }

    throw new VariantResolutionError('no variant reference was supplied', { code: 'MISSING_VARIANT' })
}

/** True when two references name the same combination. */
export function sameVariant(a, b) {
    return canonicalVariantId(a) === canonicalVariantId(b)
}

/**
 * The display label for a cart or order line, whatever shape it was written in.
 * Falls back to the legacy key so nothing ever renders blank.
 */
export function labelFor(product, { variantOptions, variantLabel: stored, variantKey } = {}) {
    if (typeof stored === 'string' && stored !== '') return stored
    const options = toOptionsObject(variantOptions)
    if (Object.keys(options).length > 0) {
        const label = variantLabel(product?.variants, options)
        if (label) return label
    }
    if (typeof variantKey === 'string' && variantKey !== '') {
        // `.find(...)` used to be here, and it returned the *first* row whose
        // legacy key matched. For a catalog that really contains
        // `["16-inch","16"] × ["1TB","inch-1TB"]` both combinations produce the
        // key `16-inch-1TB`, so a line was labelled with whichever came first —
        // an answer that looks authoritative and is a coin toss. `resolveVariant`
        // refuses that ambiguity; so does this.
        const matches = entriesOf(product).filter((candidate) => candidate.legacyKey === variantKey)
        if (matches.length === 1) {
            const label = variantLabel(product?.variants, matches[0].options)
            if (label) return label
        }
        // One match with no label, no match, or more than one: the key itself is
        // the only thing that is true.
        return variantKey
    }
    return ''
}
