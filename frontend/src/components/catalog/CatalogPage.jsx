import { useCallback, useContext, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import PropTypes from 'prop-types'

import { ShopContext } from '../../context/shopContext'
import { catalogPriceCeiling, filterProducts, matchesSearch, sortProducts, tagsOf } from '../../lib/catalog'
import { readViewState, refinementCount, writeViewState } from '../../lib/catalogView'

import CatalogMasthead from './CatalogMasthead'
import CatalogControls from './CatalogControls'
import RefineDrawer from './RefineDrawer'
import CatalogGrid from './CatalogGrid'

// One catalog page, for two routes.
//
// `/collections`, `/collections/:type` and `/products` were three surfaces
// built to two visual systems and neither of them was the homepage's. Between
// them they shipped two filter sidebars, two sort controls, two loading
// spinners, two empty states and two different `ProductCard` variants — so a
// change to how browsing works had to be made twice, and in practice was made
// once. That duplication is not only a maintenance cost; it is half of why the
// pages read as generated. Nobody designs the same page twice by accident.
//
// The pages are wrappers over this now. They keep what is genuinely theirs —
// their `<Seo>`, their canonical, their breadcrumb, and for `/products` its
// `?search=` and `?tag=` entry points — and hand everything else here.
//
// ---------------------------------------------------------------------------
// State lives in the URL
// ---------------------------------------------------------------------------
//
// Filters were component state, so a filtered view could not be linked, could
// not be reloaded, and did not survive the back button. They are search params
// now (`lib/catalogView.js`), which also means the browser's history is the
// undo stack and no code here has to be.
//
// The catalog itself is **never fetched here**. `ShopContext` loads it once;
// five homepage sections and both browse pages each pulling `/api/product/list`
// for themselves is FE-006, and this is one of the surfaces that caused it.

const CatalogPage = ({ eyebrow, title, description, type, useSearchTerm = false, children }) => {
    const {
        products,
        tags,
        catalogStatus,
        catalogError,
        reloadCatalog,
        search,
        formatPrice,
    } = useContext(ShopContext)

    const [searchParams, setSearchParams] = useSearchParams()
    const [refineOpen, setRefineOpen] = useState(false)

    const view = useMemo(() => readViewState(searchParams), [searchParams])

    // The ceiling is a property of the catalog, not a constant. The literal
    // `1000` this replaces was written into the state, into the slider's `max`
    // and into the track's percentage arithmetic, and hid every product over
    // $1,000 — on the page the empty cart's own call to action links to, in a
    // catalog whose laptops start at $1,149 (FE-003).
    const ceiling = useMemo(() => catalogPriceCeiling(products), [products])

    // The real taxonomy. Preferring the `/product/tags` endpoint the context
    // already fetched, falling back to the tags the loaded catalog carries.
    // Neither invents a category (FE-010).
    //
    // On a **typed** route the chips are scoped to tags that actually co-occur
    // with it. `/collections/laptops` offering "Speakers" is offering a filter
    // whose only possible result is an empty grid — which is the same defect
    // `addMissingCategories` had, arrived at from the other direction: there the
    // tag existed on no product, here it exists on no product *in this
    // collection*. The route's own tag is dropped too, because narrowing
    // laptops to laptops is not a refinement.
    const availableTags = useMemo(() => {
        const everything = tags?.length > 0 ? [...tags].sort() : tagsOf(products)
        if (!type || type === 'all') return everything

        const wanted = String(type).toLowerCase()
        const inCollection = tagsOf(filterProducts(products, { type }))
            .filter((tag) => tag.toLowerCase() !== wanted)
        const present = new Set(inCollection.map((tag) => tag.toLowerCase()))
        return everything.filter((tag) => present.has(tag.toLowerCase()))
    }, [tags, products, type])

    // The variant axes the catalog actually declares, and their values.
    const variantAxes = useMemo(() => {
        const axes = {}
        for (const product of products) {
            for (const axis of product?.variants ?? []) {
                if (!axis?.name) continue
                axes[axis.name] = axes[axis.name] ?? new Set()
                for (const option of axis.options ?? []) axes[axis.name].add(option)
            }
        }
        return Object.fromEntries(
            Object.entries(axes).map(([name, values]) => [name, [...values].sort()]),
        )
    }, [products])

    // `null` means "not yet touched", which is how the range keeps following
    // the catalog's own ceiling until a handle is actually moved.
    const range = useMemo(
        () => [view.min ?? 0, view.max ?? ceiling],
        [view.min, view.max, ceiling],
    )

    const update = useCallback((patch) => {
        const preserve = {}
        // `/products` is linked to from the navbar's dropdown and the search
        // bar with these two. They are not this component's to own, and
        // dropping them on the first filter click would silently widen the
        // result set under the visitor.
        for (const key of ['search', 'tag']) {
            const value = searchParams.get(key)
            if (value) preserve[key] = value
        }
        setSearchParams(writeViewState({ ...view, ...patch }, { preserve }), { replace: true })
    }, [view, searchParams, setSearchParams])

    const toggleTag = useCallback((tag) => {
        update({
            tags: view.tags.includes(tag)
                ? view.tags.filter((candidate) => candidate !== tag)
                : [...view.tags, tag],
        })
    }, [view.tags, update])

    const toggleVariant = useCallback((axis, option) => {
        const selected = view.variants[axis] ?? []
        update({
            variants: {
                ...view.variants,
                [axis]: selected.includes(option)
                    ? selected.filter((candidate) => candidate !== option)
                    : [...selected, option],
            },
        })
    }, [view.variants, update])

    const clearRefinements = useCallback(
        () => update({ min: null, max: null, variants: {} }),
        [update],
    )

    const clearEverything = useCallback(
        () => update({ min: null, max: null, variants: {}, tags: [] }),
        [update],
    )

    // The tag filter has two sources: the route's own `:type`, and the chips.
    // A typed collection is a floor the chips narrow within, never a value they
    // can widen past — `/collections/laptops` must not become the whole catalog
    // because somebody ticked "Audio".
    const visible = useMemo(() => {
        const byTag = filterProducts(products, {
            type,
            priceRange: range,
            tags: view.tags,
        })

        const byAxis = byTag.filter((product) => {
            for (const [axis, selected] of Object.entries(view.variants)) {
                if (selected.length === 0) continue
                const declared = product?.variants?.find((candidate) => candidate.name === axis)
                if (!declared) return false
                if (!selected.some((option) => declared.options?.includes(option))) return false
            }
            return true
        })

        const searched = useSearchTerm
            ? byAxis.filter((product) => matchesSearch(product, search))
            : byAxis

        return sortProducts(searched, view.sortBy)
    }, [products, type, range, view.tags, view.variants, view.sortBy, useSearchTerm, search])

    const refinements = refinementCount(
        { min: view.min, max: view.max, variants: view.variants },
        ceiling,
    )

    // FE-012 — "no products found" is a claim about the catalog. While the
    // request is still in flight the page has no basis for making it, so the
    // grid stays in its loading state rather than settling on an empty one.
    const status = catalogStatus === 'loading'
        ? 'loading'
        : catalogStatus === 'error' ? 'error' : 'ready'

    // The homepage's own gutter scale, and it has to be. `NewsLetterBar` is
    // `position: fixed` at the left edge and about 68 px wide, so a page that
    // runs closer to the viewport than that gets its first column of content
    // sat on by the social rail. Matching `Home.jsx` rather than inventing a
    // third set of gutters is also the cheaper half of "looks like the same
    // site".
    return (
        <div className="min-h-screen bg-paper px-4 pb-24 text-ink sm:px-[5vw] md:px-[7vw] lg:px-[9vw]">
            <div className="mx-auto max-w-[1600px]">
                {children}

                <CatalogMasthead
                    eyebrow={eyebrow}
                    title={title}
                    description={description}
                    count={visible.length}
                    countLabel={visible.length === 1 ? 'product' : 'products'}
                />

                <CatalogControls
                    tags={availableTags}
                    selectedTags={view.tags}
                    onToggleTag={toggleTag}
                    onClearTags={() => update({ tags: [] })}
                    sortBy={view.sortBy}
                    onSortChange={(sortBy) => update({ sortBy })}
                    density={view.density}
                    onDensityChange={(density) => update({ density })}
                    onOpenRefine={() => setRefineOpen(true)}
                    refineCount={refinements}
                />

                <CatalogGrid
                    products={visible}
                    density={view.density}
                    status={status}
                    error={catalogError}
                    onRetry={reloadCatalog}
                    onClearFilters={clearEverything}
                    hasFilters={refinements > 0 || view.tags.length > 0}
                />
            </div>

            <RefineDrawer
                open={refineOpen}
                onClose={() => setRefineOpen(false)}
                ceiling={ceiling}
                range={range}
                onRangeChange={([min, max]) => update({ min, max })}
                variantAxes={variantAxes}
                selectedVariants={view.variants}
                onToggleVariant={toggleVariant}
                onClear={clearRefinements}
                resultCount={visible.length}
                formatPrice={formatPrice}
            />
        </div>
    )
}

CatalogPage.propTypes = {
    eyebrow: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    /** The route's own tag, e.g. `laptops`. `all` and `undefined` mean everything. */
    type: PropTypes.string,
    /** Whether the shared search term narrows this surface. `/products` only. */
    useSearchTerm: PropTypes.bool,
    /** The page's `<Seo>` and any chrome that belongs to the route, not the shell. */
    children: PropTypes.node,
}

export default CatalogPage
