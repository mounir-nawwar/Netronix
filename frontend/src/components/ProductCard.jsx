import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiEye, FiHeart, FiShoppingBag } from 'react-icons/fi';

import { ShopContext } from '../context/shopContext';
import { defaultVariantSelection, isSoldOut } from '../lib/productSummary';
import PropTypes from 'prop-types'

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
// **Appearance is preserved.** Each variant renders what its callers rendered
// before, class for class. Two things genuinely change, and both are the
// finding: the dots follow the images that exist instead of a repeated one, and
// a full-card `<Link>` is a sibling of its action buttons rather than their
// ancestor, so the card is reachable without invalid nested controls.
//
// The star ratings below are **not real** — there is no review model. Removing
// or labelling them is FE-011 / PORT-005 in Phase 5, and doing it here would be
// a visual change this phase has no mandate for. They render exactly as they did.

// PERF-009 — these two were `https://placehold.co/...` URLs, so a card with a
// missing image made a request to a third-party host, and the fallback for "the
// network could not fetch this image" was itself a network fetch. They are
// inline SVG data URIs now: no request, no dependency, and they render offline.
const placeholder = (label) =>
    'data:image/svg+xml;charset=utf-8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400" role="img">' +
        '<rect width="400" height="400" fill="#f7f7f7"/>' +
        '<text x="200" y="205" text-anchor="middle" font-family="system-ui, sans-serif" ' +
        `font-size="20" fill="#a3a3a3">${label}</text>` +
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

const ImageDots = ({ count, index, onSelect, className }) => {
    if (count <= 1) return null
    return (
        <div className={className}>
            {Array.from({ length: count }, (_, dot) => (
                <button
                    key={dot}
                    type="button"
                    aria-label={`Show image ${dot + 1}`}
                    className={`relative z-20 w-1 h-1 md:w-1.5 md:h-1.5 rounded-full transition-all ${index === dot ? 'bg-black' : 'bg-gray-300'}`}
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

    const quickAdd = (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (!product?._id || soldOut) return
        addToCart(product._id, defaultVariantSelection(product), 1)
    }

    // The overlay link makes the whole card focusable/clickable while remaining
    // a sibling of quick actions, never an interactive ancestor of them.
    const wrap = (children, extra) => (
        <motion.div
            className={`${extra} ${className}`}
            whileHover={{ y: -5 }}
            transition={{ duration: 0.3 }}
        >
            <Link
                to={`/product/${product?._id ?? ''}`}
                aria-label={product?.name}
                className="absolute inset-0 z-10 rounded-[inherit]"
            />
            {children}
        </motion.div>
    )

    if (variant === 'minimal') {
        return (
            <Link className={`text-gray-700 cursor-pointer ${className}`} to={`/product/${product?._id ?? ''}`}>
                <div className='overflow-hidden'>
                    <img
                        className='hover:scale-110 transition ease-in-out'
                        src={images[0]}
                        alt={product?.name ?? 'Product'}
                        loading="lazy"
                        onError={(event) => { event.target.onerror = null; event.target.src = FAILED_IMAGE }}
                    />
                </div>
                <p className='pt-3 pb-1 text-sm'>{product?.name}</p>
                <p className='text-sm font-medium'>{price}</p>
            </Link>
        )
    }

    if (variant === 'full') {
        return wrap(
            <>
                <div
                    ref={containerRef}
                    className="relative aspect-square overflow-hidden bg-[#f9f9f9]"
                    {...handlers}
                >
                    <img
                        src={images[index]}
                        alt={product?.name ?? 'Product'}
                        className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
                        loading="lazy"
                        onError={(event) => { event.target.onerror = null; event.target.src = FAILED_IMAGE }}
                    />

                    <div className="absolute inset-0 bg-black bg-opacity-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center gap-2">
                        <button
                            type="button"
                            onClick={quickAdd}
                            className="relative z-20 p-2 bg-white rounded-full shadow-md hover:bg-indigo-500 hover:text-white transition-colors"
                            aria-label={`Add ${product?.name ?? 'product'} to cart`}
                        >
                            <FiShoppingBag className="h-5 w-5" />
                        </button>
                        <button
                            type="button"
                            className="relative z-20 p-2 bg-white rounded-full shadow-md hover:bg-indigo-500 hover:text-white transition-colors"
                            aria-label="Quick view"
                            onClick={(event) => { event.preventDefault(); event.stopPropagation() }}
                        >
                            <FiEye className="h-5 w-5" />
                        </button>
                        <button
                            type="button"
                            className="relative z-20 p-2 bg-white rounded-full shadow-md hover:bg-indigo-500 hover:text-white transition-colors"
                            aria-label="Add to wishlist"
                            onClick={(event) => { event.preventDefault(); event.stopPropagation() }}
                        >
                            <FiHeart className="h-5 w-5" />
                        </button>
                    </div>

                    {product?.tags?.length > 0 && (
                        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                            {product.tags.slice(0, 2).map((tag) => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center rounded-full bg-indigo-500 bg-opacity-80 px-2 py-1 text-xs text-white"
                                >
                                    {tag}
                                </span>
                            ))}
                            {product.tags.length > 2 && (
                                <span className="inline-flex items-center rounded-full bg-gray-800 bg-opacity-80 px-2 py-1 text-xs text-white">
                                    +{product.tags.length - 2}
                                </span>
                            )}
                        </div>
                    )}
                </div>

                <ImageDots
                    count={images.length}
                    index={index}
                    onSelect={setIndex}
                    className="flex justify-center gap-1 py-1 md:py-2"
                />

                <div className="flex flex-col flex-1 p-4">
                    <div className="flex justify-between items-start mb-1">
                        {product?.brand && (
                            <p className="text-xs md:text-sm text-indigo-600 font-medium">{product.brand}</p>
                        )}
                        <div className="flex items-center">
                            <span className="text-amber-500 text-xs md:text-sm">★★★★★</span>
                        </div>
                    </div>
                    <h3 className="text-sm md:text-base font-medium text-gray-900 mb-1 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                        {product?.name}
                    </h3>
                    <p className="mt-1 text-xs text-gray-500 line-clamp-2 flex-grow">
                        {product?.description ?? ''}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                        <p className="text-base md:text-lg font-semibold text-indigo-600">{price}</p>
                        <button
                            type="button"
                            onClick={quickAdd}
                            className="relative z-20 text-xs font-medium py-1 px-2 bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100 transition-colors"
                        >
                            Add to Cart
                        </button>
                    </div>
                </div>
            </>,
            'product-card bg-white rounded-lg overflow-hidden shadow-sm cursor-pointer group relative flex flex-col h-full',
        )
    }

    // 'showcase' — the grid card used by Collections, FeaturedProducts and any
    // other tiled surface.
    return wrap(
        <>
            <div
                ref={containerRef}
                className="relative aspect-square overflow-hidden bg-[#f9f9f9] w-full"
                {...handlers}
            >
                <img
                    src={images[index]}
                    alt={product?.name ?? 'Product'}
                    className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
                    loading="lazy"
                    onError={(event) => { event.target.onerror = null; event.target.src = FAILED_IMAGE }}
                />
            </div>

            <ImageDots
                count={images.length}
                index={index}
                onSelect={setIndex}
                className="flex justify-center gap-1 py-1 md:py-2"
            />

            <div className="px-3 md:px-4 pb-3 md:pb-4">
                <div className="flex justify-between items-start mb-0.5 md:mb-1">
                    <p className="text-[9px] md:text-sm text-gray-600 font-michroma">{product?.brand || 'Brand'}</p>
                    <div className="flex items-center">
                        <span className="text-[#6a5acd] text-xs md:text-base">★</span>
                        <span className="text-[9px] md:text-sm ml-0.5 md:ml-1">4.5</span>
                    </div>
                </div>
                <h3 className="text-xs md:text-lg font-michroma text-gray-900 mb-1 md:mb-2 relative group-hover:after:w-full after:w-0 after:h-[2px] after:bg-[#6a5acd] after:absolute after:left-0 after:bottom-0 after:transition-all after:duration-300 truncate">
                    {product?.name}
                </h3>
                <p className="text-sm md:text-lg font-michroma text-[#6a5acd] mb-2 md:mb-3">{price}</p>

                {showQuickAdd && (
                    <button
                        type="button"
                        className={`relative z-20 w-full py-1.5 md:py-2.5 px-2 md:px-4 rounded-[3px] font-michroma text-[8px] md:text-[12px] transition-all ${
                            soldOut ? 'bg-gray-200 text-gray-600 cursor-not-allowed' : 'fill-button fill-button-purple'
                        }`}
                        onClick={quickAdd}
                        disabled={soldOut}
                    >
                        {soldOut ? 'Sold Out' : 'ADD TO CART'}
                    </button>
                )}
            </div>
        </>,
        'product-card bg-[#f9f9f9] rounded-2xl overflow-hidden cursor-pointer group relative flex flex-col min-w-[120px] md:min-w-0',
    )
}

ProductCard.propTypes = {
    product: productShape,
    variant: PropTypes.oneOf(['full', 'showcase', 'minimal']),
    showQuickAdd: PropTypes.bool,
    className: PropTypes.string,
}

export default ProductCard
