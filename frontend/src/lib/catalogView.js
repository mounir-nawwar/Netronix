// The catalog's *view* state — what the visitor has asked to see — as data.
//
// `lib/catalog.js` owns filtering and sorting the products themselves, and is
// deliberately pure. This is the layer above it: which sort is selected, which
// tags are ticked, how dense the grid is, and how all of that survives a reload
// or a pasted link.
//
// It is a module rather than three constants in a component because
// `react-refresh/only-export-components` is on with `--max-warnings 0`, and
// because the URL round-trip below is the kind of thing that is only correct
// once — both browse pages need it and neither should own it.

/** The orders the sort control offers, in the order it offers them. */
export const SORT_OPTIONS = [
    { value: 'newest', label: 'Newest' },
    { value: 'price-low', label: 'Price, low to high' },
    { value: 'price-high', label: 'Price, high to low' },
    { value: 'name-asc', label: 'Name, A to Z' },
    { value: 'name-desc', label: 'Name, Z to A' },
]

export const DEFAULT_SORT = 'newest'

/** Columns per breakpoint for each density. Three-up is the default. */
export const DENSITIES = {
    comfortable: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-3',
    compact: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4',
}

export const DEFAULT_DENSITY = 'comfortable'

/** A sort value the control actually offers, or the default. */
export function normaliseSort(value) {
    return SORT_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_SORT
}

export function normaliseDensity(value) {
    return Object.hasOwn(DENSITIES, value ?? '') ? value : DEFAULT_DENSITY
}

/**
 * Read the view state out of a `URLSearchParams`.
 *
 * Every value is validated against what the catalog actually offers, because
 * the query string is visitor-supplied: `?sort=drop-tables` selects the default,
 * and `?tags=` naming a tag no product carries simply matches nothing rather
 * than throwing.
 *
 * `min`/`max` are `null` when absent, which is the "not yet touched" state the
 * price filter uses to keep following the catalog's own ceiling.
 */
export function readViewState(searchParams) {
    const number = (key) => {
        const raw = searchParams.get(key)
        if (raw === null || raw.trim() === '') return null
        const parsed = Number(raw)
        return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null
    }

    const list = (key) => (searchParams.get(key) ?? '')
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry !== '')

    const axes = {}
    for (const [key, value] of searchParams.entries()) {
        if (!key.startsWith('opt.')) continue
        const axis = key.slice(4)
        if (axis === '') continue
        axes[axis] = value.split(',').map((entry) => entry.trim()).filter(Boolean)
    }

    return {
        tags: list('tags'),
        sortBy: normaliseSort(searchParams.get('sort')),
        density: normaliseDensity(searchParams.get('density')),
        min: number('min'),
        max: number('max'),
        variants: axes,
    }
}

/**
 * Write the view state back, dropping everything that is at its default.
 *
 * Defaults are omitted rather than written so that `/collections/all` stays
 * `/collections/all` until the visitor actually changes something. A URL that
 * grows `?sort=newest&density=comfortable` on load is a URL nobody wants to
 * share, and it makes the back button walk through states the visitor never
 * chose.
 *
 * `preserve` carries through the params this layer does not own — `search` and
 * `tag`, which `/products` reads from links elsewhere in the site.
 */
export function writeViewState(state, { preserve = {} } = {}) {
    const params = new URLSearchParams()

    for (const [key, value] of Object.entries(preserve)) {
        if (value !== null && value !== undefined && value !== '') params.set(key, value)
    }

    if (state.tags?.length > 0) params.set('tags', state.tags.join(','))
    if (state.sortBy && state.sortBy !== DEFAULT_SORT) params.set('sort', state.sortBy)
    if (state.density && state.density !== DEFAULT_DENSITY) params.set('density', state.density)
    if (state.min !== null && state.min !== undefined) params.set('min', String(state.min))
    if (state.max !== null && state.max !== undefined) params.set('max', String(state.max))

    for (const [axis, values] of Object.entries(state.variants ?? {})) {
        if (values?.length > 0) params.set(`opt.${axis}`, values.join(','))
    }

    return params
}

/** How many refinements the drawer is currently holding, for its badge. */
export function refinementCount({ min, max, variants }, ceiling) {
    const priced = (min !== null && min !== undefined && min > 0)
        || (max !== null && max !== undefined && max < ceiling)
    const axes = Object.values(variants ?? {}).reduce((total, values) => total + (values?.length ?? 0), 0)
    return (priced ? 1 : 0) + axes
}
