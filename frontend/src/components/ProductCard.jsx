import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import PropTypes from 'prop-types'

import { ShopContext } from '../context/shopContext'
import {
    configCount,
    defaultVariantSelection,
    isSoldOut,
    specLine,
    stockSignal,
} from '../lib/productSummary'

// FE-007 / TEST-005 — one product card.
//
// There were four, and they had drifted:
//
//   * `AllProducts.ProductCard` (190 lines) — the good one. Real mouse-position
//     image scrubbing across the product's actual images, touch swipe, tag
//     badges, a hover action row.
//   * `Collections.ProductCard` (121 lines) — **fabricated three images by
//     repeating `image[0]`**, so the navigation dots promised two photographs
//     that do not exist, and read `product.vendor`, a field the schema has never
//     had.
//   * `FeaturedProducts`' inline card — a third copy of the same layout with a
//     third set of small differences.
//   * `ProductItem` (17 lines) — `alt=""` on a product photograph.
//
// A fix to image handling or to keyboard access had to be made four times, and
// in practice was made once. This is that component, with the presentation
// differences kept as explicit variants rather than as separate files.
//
// ---------------------------------------------------------------------------
// The redesign, and what it deliberately keeps
// ---------------------------------------------------------------------------
//
// The consolidation above preserved appearance class-for-class, which meant it
// also preserved three things that were wrong:
//
//   * **Fabricated ratings.** `★★★★★` on the `full` variant and a hardcoded
//     `★ 4.5` on `showcase`, on every product, with no review model anywhere in
//     the schema. The previous version of this comment said so and rendered
//     them anyway. They are gone; `stockSignal`, `specLine` and `configCount`
//     say things the catalog can actually support.
//   * **Two dead buttons.** The hover overlay's "Quick view" and "Add to
//     wishlist" called `preventDefault(); stopPropagation()` and nothing else —
//     affordances that promised a feature that was never built. Gone. The
//     overlay is one control now, and it works.
//   * **Two visual languages.** `full` was Tailwind-default indigo with no
//     brand face; `showcase` was Michroma and `#6a5acd`. Same component, same
//     catalog, two looks. They are one card now: the variants differ only in
//     *what they say* (`full` adds the description and the tags its callers
//     need), never in how they say it.
//
// Michroma is a display face. It is used here for the brand eyebrow only — it
// was previously set on product names at 12px, where it is close to unreadable
// and where `truncate` was quietly removing the half of "RTX 4090 32GB" that
// distinguishes one machine from another.
//
// **Behaviour is preserved.** The pointer-scrubbing, the touch swipe, the dot
// row that follows the images that exist, the inline-SVG placeholders, and the
// full-card `<Link>` that is a *sibling* of its action button rather than an
// interactive ancestor of it — all unchanged, and all still under test.

// PERF-009 — these two were `https://placehold.co/...` URLs, so a card with a
// missing image made a request to a third-party host, and the fallback for "the
// network could not fetch this image" was itself a network fetch. They are
// inline SVG data URIs now: no request, no dependency, and they render offline.
const placeholder = (label) =>
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" role="img">' +
        '<rect width="400" height="400" fill="#ffffff"/>' +
        '<text x="200" y="205" text-anchor="middle" font-family="system-ui, sans-serif" ' +
        `font-size="18" fill="#8e8e95">${label}</text>` +
        '</svg>',
    )

const PLACEHOLDER_IMAGE = placeholder('No image')
const FAILED_IMAGE = placeholder('Image not available')

/**
 * Mouse-position image scrubbing, plus touch swipe.
 *
 * The interaction the audit singles out as worth keeping: the pointer's
 * horizontal position across the image selects which of the product's
 * photographs is shown, so a card previews the whole set without a click. It is
 * disabled below 768 px, where swipe takes over.
 */
function useImageScrubbing(images) {
    const [index, setIndex] = useState(0)
    const [isMobile, setIsMobile] = useState(false)
    const [touchStart, setTouchStart] = useState(null)
    const containerRef = useRef(null)

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    // A shorter image list must never leave the index pointing past its end.
    useEffect(() => {
        setIndex((current) => (current < images.length ? current : 0))
    }, [images.length])

    const handleMouseMove = (event) => {
        if (isMobile || images.length <= 1 || !containerRef.current) return
        const { left, width } = containerRef.current.getBoundingClientRect()
        const section = width / images.length
        const next = Math.min(Math.floor((event.clientX - left) / section), images.length - 1)
        if (next >= 0) setIndex(next)
    }

    const handleMouseLeave = () => setIndex(0)

    const handleTouchStart = (event) => setTouchStart(event.touches[0].clientX)

    const handleTouchMove = (event) => {
        if (touchStart === null || images.length <= 1) return
        const difference = touchStart - event.touches[0].clientX
        if (Math.abs(difference) <= 5) return   // a threshold, so a tap is not a swipe
        setIndex((current) => (current + (difference > 0 ? 1 : images.length - 1)) % images.length)
        setTouchStart(null)
    }

    return {
        index,
        setIndex,
        containerRef,
        handlers: {
            onMouseMove: handleMouseMove,
            onMouseLeave: handleMouseLeave,
            onTouchStart: handleTouchStart,
            onTouchMove: handleTouchMove,
        },
    }
}

/**
 * The image pager, as bars rather than dots.
 *
 * A bar reads as a position in a strip, which is what scrubbing actually moves
 * through; a circle reads as a carousel with a next button that is not there.
 * They sit inside the plate so the card's type column below stays uninterrupted.
 */
const ImageDots = ({ count, index, onSelect, className }) => {
    if (count <= 1) return null
    return (
        <div className={className}>
            {Array.from({ length: count }, (_, dot) => (
                <button
                    key={dot}
                    type="button"
                    aria-label={`Show image ${dot + 1}`}
                    aria-current={index === dot}
                    className={`relative z-20 h-[2px] w-5 md:w-6 transition-colors duration-300 ${
                        index === dot ? 'bg-ink' : 'bg-ink/20 hover:bg-ink/40'
                    }`}
                    onClick={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                        onSelect(dot)
                    }}
                />
            ))}
        </div>
    )
}

ImageDots.propTypes = {
    count: PropTypes.number.isRequired,
    index: PropTypes.number.isRequired,
    onSelect: PropTypes.func.isRequired,
    className: PropTypes.string,
}

/**
 * The one stock fact, when there is one.
 *
 * Rendered only for `sold-out` and `low`, which is why it reads as information
 * rather than as decoration: on a healthy catalog most cards carry no chip at
 * all. A badge on every card is a texture, and a texture is what the five stars
 * this replaces actually were.
 */
const StockChip = ({ signal }) => {
    if (signal.kind === 'none') return null

    const soldOut = signal.kind === 'sold-out'
    return (
        <span
            className={`pointer-events-none absolute left-3 top-3 z-20 font-michroma text-[8px] md:text-[9px] uppercase tracking-[0.16em] px-2 py-1 ${
                soldOut ? 'bg-ink text-paper' : 'bg-paper text-ink border border-rule'
            }`}
        >
            {soldOut ? 'Sold out' : `Last ${signal.quantity}`}
        </span>
    )
}

StockChip.propTypes = {
    signal: PropTypes.shape({
        kind: PropTypes.oneOf(['sold-out', 'low', 'none']).isRequired,
        quantity: PropTypes.number.isRequired,
    }).isRequired,
}

/**
 * The catalog product, as this card reads it.
 *
 * Deliberately loose about `inventory` and `variants`: their shape is the
 * backend contract, `lib/variant.js` owns interpreting it, and restating it
 * here would be a second definition to keep in step with the first.
 */
const productShape = PropTypes.shape({
    _id: PropTypes.string,
    name: PropTypes.string,
    brand: PropTypes.string,
    description: PropTypes.string,
    price: PropTypes.number,
    priceMinor: PropTypes.number,
    image: PropTypes.arrayOf(PropTypes.string),
    tags: PropTypes.arrayOf(PropTypes.string),
})

const ProductCard = ({ product, variant = 'showcase', showQuickAdd = false, className = '' }) => {
    const { addToCart, formatPrice, getPriceMinor } = useContext(ShopContext)

    // Real images only. `Collections` used to repeat `image[0]` three times so
    // its dot row always had three dots; a product with one photograph now shows
    // one, which is the truth and is also what `AllProducts` always did.
    const images = useMemo(() => {
        const real = Array.isArray(product?.image)
            ? product.image.filter((image) => typeof image === 'string' && image.trim() !== '')
            : []
        return real.length > 0 ? real : [PLACEHOLDER_IMAGE]
    }, [product])

    const { index, setIndex, containerRef, handlers } = useImageScrubbing(images)

    const soldOut = isSoldOut(product)
    const price = formatPrice(getPriceMinor(product))

    // Derived, never invented. `specLine` is the declared axes' own first
    // values; when a product declares none there is nothing true to put here,
    // so the line is dropped rather than padded.
    const signal = stockSignal(product)
    const specs = specLine(product)
    const configs = configCount(product)
    const meta = specs || (configs > 1 ? `${configs} configurations` : '')

    const quickAdd = (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!product?._id || soldOut) return
        addToCart(product._id, defaultVariantSelection(product), 1)
    }

    // `full` always offers the control its callers relied on; `showcase` offers
    // it only when asked, which is the contract `FeaturedProducts` and the
    // catalog grid are built against.
    const offersQuickAdd = variant === 'full' || showQuickAdd

    const productHref = `/product/${product?._id ?? ''}`

    if (variant === 'minimal') {
        return (
            <Link className={`group block ${className}`} to={productHref}>
                <div className="relative aspect-square overflow-hidden bg-plate">
                    <img
                        className="h-full w-full object-contain p-4 transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                        src={images[0]}
                        alt={product?.name ?? 'Product'}
                        loading="lazy"
                        decoding="async"
                        onError={(event) => { event.target.onerror = null; event.target.src = FAILED_IMAGE }}
                    />
                </div>
                {product?.brand && (
                    <p className="pt-3 font-michroma text-[9px] uppercase tracking-[0.18em] text-ink-40">
                        {product.brand}
                    </p>
                )}
                <p className="pt-1 text-sm leading-snug text-ink clamp-2">{product?.name}</p>
                <p className="pt-1 text-sm text-ink tnum">{price}</p>
                <span className="rule-draw mt-3 block h-px w-full bg-rule" aria-hidden="true" />
            </Link>
        )
    }

    // `full` and `showcase` are the same card. The only differences are what
    // each one says: `full` carries the description and the tags, because its
    // callers render it in a context that has room for them.
    return (
        <div className={`product-card group relative flex h-full flex-col ${className}`}>
            {/* The overlay link makes the whole card focusable and clickable while
                remaining a *sibling* of the quick-add button, never an
                interactive ancestor of it. Nested controls are invalid HTML and
                unreachable by keyboard, which is what three of the four
                superseded cards shipped. */}
            <Link
                to={productHref}
                aria-label={product?.name}
                className="absolute inset-0 z-10"
            />

            <div
                ref={containerRef}
                className="relative aspect-square w-full overflow-hidden bg-plate"
                {...handlers}
            >
                <img
                    src={images[index]}
                    alt={product?.name ?? 'Product'}
                    className={`h-full w-full object-contain p-6 transition-transform duration-700 ease-out md:p-9 ${
                        soldOut ? 'opacity-55 group-hover:scale-100' : 'group-hover:scale-[1.04]'
                    }`}
                    loading="lazy"
                    decoding="async"
                    onError={(event) => { event.target.onerror = null; event.target.src = FAILED_IMAGE }}
                />

                <StockChip signal={signal} />

                <ImageDots
                    count={images.length}
                    index={index}
                    onSelect={setIndex}
                    className="absolute inset-x-0 bottom-3 z-20 flex justify-center gap-1.5"
                />

                {offersQuickAdd && (
                    /* One control, and it works. This replaces three circular
                       buttons over a black scrim, two of which did nothing at
                       all.

                       Two shapes, because a phone has no hover to reveal
                       anything with. Above `md` it is a bar that rises out of
                       the bottom of the plate on hover or keyboard focus. Below
                       it, the bar would have to be permanent — and twenty
                       full-width black bands down a phone screen is a page of
                       buttons with products behind them — so it is a small pill
                       tucked into the corner instead. Same button, same
                       accessible name, same handler. */
                    <button
                        type="button"
                        onClick={quickAdd}
                        disabled={soldOut}
                        // A grid of twenty buttons all announced as "Add to
                        // cart" is twenty identical targets to a screen-reader
                        // user, which is why the name carries the product.
                        // Sold out takes its name from its own text: "MacBook
                        // Pro is sold out" reads worse than the plain state.
                        aria-label={soldOut ? undefined : `Add ${product?.name ?? 'this product'} to cart`}
                        // Top-right below `md`, because the image pager sits
                        // centred along the bottom of the plate and a pill in
                        // that corner lands on it at two-up card widths. The
                        // sold-out chip is top-*left*, so the two never meet.
                        className={`absolute right-2.5 top-2.5 z-20 flex items-center justify-center gap-2 px-3 py-2 font-michroma text-[8px] uppercase tracking-[0.16em] transition-all duration-300 ease-out md:inset-x-0 md:bottom-0 md:top-auto md:px-0 md:py-3 md:text-[10px] ${
                            soldOut
                                // Hidden below `md`, where the pill is a
                                // resting state rather than a hover reveal: the
                                // chip in the opposite corner already says
                                // "Sold out", and printing it twice on one tile
                                // is the card arguing with itself. A disabled
                                // action adds nothing next to it.
                                ? 'hidden cursor-not-allowed bg-wash text-ink-40 md:flex'
                                : 'bg-ink text-paper hover:bg-statepurp'
                        } md:translate-y-full md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100`}
                    >
                        {soldOut ? 'Sold Out' : (
                            <>
                                <span>Add to cart</span>
                                <span aria-hidden="true">&#8599;</span>
                            </>
                        )}
                    </button>
                )}
            </div>

            <div className="flex flex-1 flex-col pt-4">
                {product?.brand && (
                    <p className="font-michroma text-[9px] uppercase leading-none tracking-[0.18em] text-ink-40 md:text-[10px]">
                        {product.brand}
                    </p>
                )}

                <h3 className="clamp-2 clamp-2-fixed mt-2 text-[14px] leading-snug text-ink md:text-[15px]">
                    {product?.name}
                </h3>

                {meta && (
                    <p className="mt-1.5 text-[11px] leading-snug text-ink-60 md:text-xs">{meta}</p>
                )}

                {variant === 'full' && product?.description && (
                    <p className="clamp-2 mt-2 text-[11px] leading-relaxed text-ink-40 md:text-xs">
                        {product.description}
                    </p>
                )}

                {variant === 'full' && product?.tags?.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[9px] uppercase tracking-[0.14em] text-ink-40 md:text-[10px]">
                        {product.tags.slice(0, 3).map((tag) => (
                            <span key={tag}>{tag}</span>
                        ))}
                    </p>
                )}

                <p className="mt-auto pt-3 text-[15px] text-ink tnum md:text-base">{price}</p>

                {/* The card's whole hover payload, besides the image: a hairline
                    that draws in the one accent colour the catalog uses. */}
                <span className="rule-draw mt-3 block h-px w-full bg-rule" aria-hidden="true" />
            </div>
        </div>
    )
}

ProductCard.propTypes = {
    product: productShape,
    variant: PropTypes.oneOf(['full', 'showcase', 'minimal']),
    showQuickAdd: PropTypes.bool,
    className: PropTypes.string,
}

export default ProductCard
