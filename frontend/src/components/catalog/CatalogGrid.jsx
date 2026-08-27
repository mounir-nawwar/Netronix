import { useMemo } from 'react'
import PropTypes from 'prop-types'
import { AnimatePresence, motion } from 'framer-motion'

import ProductCard from '../ProductCard'
import CardSkeleton from './CardSkeleton'
import EditorialTile from './EditorialTile'
import { DENSITIES } from '../../lib/catalogView'

import gaming800 from '../../assets/optimised/gaming-category-800.webp'
import gaming400 from '../../assets/optimised/gaming-category-400.webp'
import macbook800 from '../../assets/optimised/macbook-category-800.webp'
import macbook400 from '../../assets/optimised/macbook-category-400.webp'
import accessories800 from '../../assets/optimised/accessories-category-800.webp'
import accessories400 from '../../assets/optimised/accessories-category-400.webp'

// The grid, its interstitials, its motion and its three states.
//
// The interstitials rotate through this list rather than being chosen per
// collection, because the alternative is a lookup table mapping every possible
// tag to a slab, and a tag with no entry then renders nothing — which is how
// the old `FeaturedProducts` ended up shipping three permanently empty tabs.
// Rotating means every catalog gets the same rhythm whatever its taxonomy.
//
// The imagery is the WebP set `scripts/optimise-media.sh` already produced for
// the homepage. No new asset is fetched to make this page look like this.
const INTERSTITIALS = [
    {
        eyebrow: 'Built to win',
        title: 'Gaming, without the compromise',
        copy: 'Desktop-class GPUs, high-refresh panels and thermals that hold a boost clock past the first ten minutes.',
        to: '/collections/gaming',
        cta: 'Shop gaming',
        image: gaming800,
        imageSmall: gaming400,
    },
    {
        eyebrow: 'Apple silicon',
        title: 'The MacBook line, in stock',
        copy: 'Every configuration priced per variant, so the number on the card is the number you pay.',
        to: '/collections/macbooks',
        cta: 'Shop MacBooks',
        image: macbook800,
        imageSmall: macbook400,
    },
    {
        eyebrow: 'The rest of the desk',
        title: 'Accessories that keep up',
        copy: 'Keyboards, mice, docks and power — the parts that decide whether the machine is pleasant to use.',
        to: '/collections/accessories',
        cta: 'Shop accessories',
        image: accessories800,
        imageSmall: accessories400,
    },
]

/** A tile after every `INTERSTITIAL_EVERY` products, never as the last element. */
const INTERSTITIAL_EVERY = 8

/**
 * Interleave the editorial tiles into the product list.
 *
 * Returned as one flat array of tagged items so the grid renders a single
 * `map`, which is what lets `AnimatePresence` see cards leaving and arriving as
 * the filters change without the tiles re-mounting around them.
 */
function interleave(products) {
    const items = []
    let tile = 0

    products.forEach((product, index) => {
        items.push({ kind: 'product', key: product._id, product })

        const boundary = (index + 1) % INTERSTITIAL_EVERY === 0
        const isLast = index === products.length - 1
        if (boundary && !isLast) {
            items.push({
                kind: 'tile',
                key: `tile-${tile}`,
                tile: INTERSTITIALS[tile % INTERSTITIALS.length],
            })
            tile += 1
        }
    })

    return items
}

const CatalogGrid = ({ products, density, status, error, onRetry, onClearFilters, hasFilters }) => {
    const items = useMemo(() => interleave(products), [products])
    const columns = DENSITIES[density] ?? DENSITIES.comfortable

    if (status === 'loading') {
        return (
            <div
                className={`grid ${columns} gap-x-5 gap-y-12 py-12 md:gap-x-6 md:gap-y-16`}
                role="status"
                aria-live="polite"
            >
                {Array.from({ length: 9 }, (_, index) => <CardSkeleton key={index} index={index} />)}
                <span className="sr-only">Loading products…</span>
            </div>
        )
    }

    // FE-024 — a failed catalog is not an empty one, and saying "no products
    // found" when the request failed is a lie the customer cannot act on.
    if (status === 'error') {
        return (
            <div className="border border-rule px-6 py-20 text-center" role="alert">
                <h2 className="font-michroma text-sm uppercase tracking-[0.16em] text-ink">
                    We could not load the catalog
                </h2>
                <p className="mx-auto mt-4 max-w-[42ch] text-sm text-ink-60">
                    {error || 'Please try again in a moment.'}
                </p>
                <button
                    type="button"
                    onClick={onRetry}
                    className="mt-8 border border-ink bg-ink px-8 py-3 font-michroma text-[9px] uppercase tracking-[0.16em] text-paper transition-colors duration-300 hover:bg-statepurp hover:border-statepurp"
                >
                    Try again
                </button>
            </div>
        )
    }

    if (products.length === 0) {
        return (
            <div className="border border-rule px-6 py-20 text-center">
                <h2 className="font-michroma text-sm uppercase tracking-[0.16em] text-ink">
                    No products found
                </h2>
                <p className="mx-auto mt-4 max-w-[42ch] text-sm text-ink-60">
                    {hasFilters
                        ? 'Nothing in the catalog matches every filter at once. Widening the price range usually helps.'
                        : 'This collection is empty right now.'}
                </p>
                {hasFilters && (
                    <button
                        type="button"
                        onClick={onClearFilters}
                        className="mt-8 border border-ink bg-ink px-8 py-3 font-michroma text-[9px] uppercase tracking-[0.16em] text-paper transition-colors duration-300 hover:bg-statepurp hover:border-statepurp"
                    >
                        Clear filters
                    </button>
                )}
            </div>
        )
    }

    return (
        <div className={`grid ${columns} gap-x-5 gap-y-12 py-12 md:gap-x-6 md:gap-y-16`}>
            {/* `popLayout` takes a leaving card out of flow immediately, so the
                cards that remain glide to their new positions instead of waiting
                for the exit to finish and then jumping. That gliding is the
                whole point: filtering used to be a hard cut.

                The stagger is capped at twelve steps. `staggerChildren: 0.1`
                across a thirty-product catalog is a three-second wait before the
                last card exists, which on a slow connection is indistinguishable
                from a page that failed to load. */}
            <AnimatePresence mode="popLayout" initial={false}>
                {items.map((item, index) => (
                    <motion.div
                        key={item.key}
                        layout
                        className={item.kind === 'tile' ? 'col-span-2 md:col-span-3 xl:col-span-full' : ''}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{
                            duration: 0.45,
                            ease: [0.22, 1, 0.36, 1],
                            delay: Math.min(index, 11) * 0.035,
                            layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
                        }}
                    >
                        {item.kind === 'tile'
                            ? <EditorialTile {...item.tile} />
                            : <ProductCard product={item.product} variant="showcase" showQuickAdd />}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    )
}

CatalogGrid.propTypes = {
    products: PropTypes.arrayOf(PropTypes.object).isRequired,
    density: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    error: PropTypes.string,
    onRetry: PropTypes.func.isRequired,
    onClearFilters: PropTypes.func.isRequired,
    hasFilters: PropTypes.bool.isRequired,
}

export default CatalogGrid
