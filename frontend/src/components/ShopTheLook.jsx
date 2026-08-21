import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';

import { ShopContext } from '../context/shopContext';
import { defaultVariantSelection, isSoldOut } from '../lib/productSummary';
// PERF-004 — the 2000×1125 editorial photograph, as WebP at two widths.
import mainImage800 from '../assets/optimised/shop-the-look-800.webp';
import mainImage1600 from '../assets/optimised/shop-the-look-1600.webp';

// FE-004 / PORT-001 / FE-021 — the section that took the whole site down.
//
// It named four products by literal ObjectId. Against a fresh database all four
// `.find()` calls returned `undefined`, and the code then did this:
//
//     { ...monitorProduct, position: productPositions[0] }
//
// `{ ...undefined }` is `{}`, which is truthy, so `.filter(Boolean)` kept four
// nameless objects, `products.length > 0` was true, and `getProductImage` read
// `product.name.toLowerCase()` on an object with no name — throwing during
// render. With no error boundary anywhere (FE-021), that was not a blank
// section: it was a blank *site*.
//
// The second failure mode was quieter and worse. While loading, and whenever the
// lookups failed, it displayed four **invented products** — "Monitor", "$0",
// rated 4.7 — that a visitor could not tell from real ones.
//
// Products now declare that they belong here, ordered, and an empty catalog
// renders an empty state. There are no placeholder products left to invent.

/** Where each hotspot sits on the photograph, in slot order. */
const HOTSPOT_POSITIONS = [
    { top: '38%', left: '50%' },
    { top: '50%', left: '25%' },
    { top: '45%', left: '70%' },
    { top: '70%', left: '41%' },
];

const ShopTheLook = () => {
    const [activeProduct, setActiveProduct] = useState(0);
    const [imageHeight, setImageHeight] = useState(0);
    const imageRef = useRef(null);
    const { showcase, catalogStatus, addToCart, formatPrice, getPriceMinor } = useContext(ShopContext);

    const loading = catalogStatus === 'loading';

    /**
     * The products on the photograph, in the order the hotspots are placed.
     *
     * Bounded by the number of hotspots, because a fifth product would have
     * nowhere on the image to point at.
     */
    const products = useMemo(
        () => showcase('shop-the-look', { limit: HOTSPOT_POSITIONS.length })
            .map((product, index) => ({ ...product, position: HOTSPOT_POSITIONS[index] })),
        [showcase],
    );

    // A shorter list must never leave the selection pointing past its end.
    useEffect(() => {
        setActiveProduct((current) => (current < products.length ? current : 0));
    }, [products.length]);

    // Update image height on resize
    useEffect(() => {
        const updateHeight = () => {
            if (imageRef.current) setImageHeight(imageRef.current.clientHeight);
        };

        updateHeight();
        window.addEventListener('resize', updateHeight);
        return () => window.removeEventListener('resize', updateHeight);
    }, []);

    const handleAddToCart = (product, event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!product?._id) return;
        // DB-003 — the combination comes from the product's typed inventory
        // rather than from `variants.map(v => v.options[0]).join('-')`, which
        // produces a key that cannot be split back apart.
        addToCart(product._id, defaultVariantSelection(product), 1);
    };

    const active = products[activeProduct] ?? null;

    return (
        <div className="w-full py-10 md:py-16 bg-white px-3 md:px-10">
            <div className="container mx-auto px-0 md:px-4">
                <div className="mb-6 md:mb-8 text-center">
                    <div className="relative inline-block border-b border-gray-200 pb-2">
                        <h2 className="text-2xl sm:text-3xl md:text-4xl font-michroma tracking-wider text-gray-900">
                            PROFESSIONAL WORKSPACE
                        </h2>
                        <div className="mt-1 flex items-center justify-center gap-2">
                            <div className="h-[1px] w-6 md:w-10 bg-gray-400"></div>
                            <span className="font-michroma text-[10px] md:text-xs tracking-widest text-[#6a5acd]">CURATED COLLECTION</span>
                            <div className="h-[1px] w-6 md:w-10 bg-gray-400"></div>
                        </div>
                    </div>
                    <p className="text-xs sm:text-sm text-gray-600 mt-3 md:mt-4 max-w-2xl mx-auto font-light tracking-wide">
                        Explore our selection of premium tech essentials for the modern workspace
                    </p>
                </div>
                <div className="flex flex-col lg:flex-row gap-8 md:gap-20">

                    {/* Main Room Image Section with Title */}
                    <div className="w-full lg:w-[65%]">
                        <div ref={imageRef} className="relative rounded-lg overflow-hidden shadow-md" style={{ aspectRatio: '16/9' }}>
                            <img
                                src={mainImage1600}
                                srcSet={`${mainImage800} 800w, ${mainImage1600} 1600w`}
                                sizes="(max-width: 1023px) 92vw, 60vw"
                                alt="Premium workspace setup"
                                width={1600}
                                height={900}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                decoding="async"
                            />

                            {/* Hotspots with pulsing animation - Smaller on mobile */}
                            {products.map((product, index) => (
                                <div
                                    key={product._id}
                                    className={`absolute w-6 h-6 md:w-8 md:h-8 rounded-full bg-white shadow-lg flex items-center justify-center cursor-pointer transition-all duration-300 ${activeProduct === index ? 'ring-2 ring-black scale-110' : ''}`}
                                    style={{
                                        ...product.position,
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                    onMouseEnter={() => setActiveProduct(index)}
                                    onClick={() => setActiveProduct(index)}
                                >
                                    <span className={`w-3 h-3 md:w-4 md:h-4 rounded-full bg-black ${activeProduct === index ? 'scale-75' : ''} transition-transform`}></span>

                                    {/* Pulsing animation ring */}
                                    <span className={`absolute w-full h-full rounded-full ${activeProduct === index ? 'animate-ping opacity-30 bg-[#6a5acd]' : ''}`}></span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Current Product Card Section */}
                    <div
                        className="w-full lg:w-[25%] flex flex-col mx-auto"
                        style={{
                            height: imageHeight > 0 && window.innerWidth >= 1024 ? `${imageHeight}px` : 'auto',
                            maxWidth: window.innerWidth < 768 ? '280px' : window.innerWidth < 1024 ? '320px' : 'none'
                        }}
                    >
                        {/* FE-004 — an empty catalog gets an empty state, not four
                            invented products with invented prices and ratings. */}
                        {!loading && products.length === 0 && (
                            <div className="w-full flex-grow flex items-center justify-center">
                                <p className="text-center text-gray-500 font-michroma text-sm">
                                    No workspace picks yet.
                                </p>
                            </div>
                        )}

                        {/* Active Product Card - Sized like FeaturedProducts */}
                        {active && (
                            <div className="w-full flex-grow flex flex-col">
                                <motion.div
                                    className="product-card bg-[#f9f9f9] rounded-2xl overflow-hidden group relative flex flex-col flex-grow shadow-md"
                                    whileHover={{ y: -5 }}
                                    transition={{ duration: 0.3 }}
                                >
                                    <Link to={`/product/${active._id}`} aria-label={active.name} className="flex flex-col flex-grow">
                                        <div className="relative h-64 mb-3">
                                            <img
                                                src={active.image?.[0]}
                                                alt={active.name}
                                                className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
                                                loading="lazy"
                                            />
                                        </div>

                                        <div className="px-3 md:px-4 pb-3 md:pb-4 flex-grow flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-start mb-1">
                                                    <p className="text-xs md:text-sm text-gray-600 font-michroma">{active.brand || 'Brand'}</p>
                                                    <div className="flex items-center">
                                                        <span className="text-[#6a5acd]">★</span>
                                                        <span className="text-xs md:text-sm ml-1">4.5</span>
                                                    </div>
                                                </div>
                                                <h3 className="text-sm md:text-lg font-michroma text-gray-900 mb-1 md:mb-2 relative group-hover:after:w-full after:w-0 after:h-[2px] after:bg-[#6a5acd] after:absolute after:left-0 after:bottom-0 after:transition-all after:duration-300">
                                                    {active.name}
                                                </h3>
                                                <p className="text-base md:text-lg font-michroma text-[#6a5acd] mb-2 md:mb-3">
                                                    {formatPrice(getPriceMinor(active))}
                                                </p>
                                            </div>
                                        </div>
                                    </Link>

                                    <div className="px-3 md:px-4 pb-3 md:pb-4">
                                        <button
                                            type="button"
                                            className={`w-full py-2 md:py-2.5 px-3 md:px-4 rounded-[3px] font-michroma text-[10px] md:text-[12px] transition-all ${
                                                isSoldOut(active)
                                                    ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
                                                    : 'fill-button fill-button-purple'
                                            }`}
                                            onClick={(event) => handleAddToCart(active, event)}
                                            disabled={isSoldOut(active)}
                                        >
                                            {isSoldOut(active) ? 'SOLD OUT' : 'ADD TO CART'}
                                        </button>
                                    </div>
                                </motion.div>

                                {/* Navigation Dots */}
                                <div className="flex justify-center mt-3 md:mt-4 mb-2 gap-2">
                                    {products.map((product, index) => (
                                        <button
                                            key={product._id}
                                            type="button"
                                            className={`w-2 h-2 rounded-full transition-all duration-300 shadow-md ${activeProduct === index
                                                    ? 'bg-[#6a5acd] w-3 h-3 shadow-[#6a5acd]/50'
                                                    : 'bg-gray-300'
                                                }`}
                                            onClick={() => setActiveProduct(index)}
                                            aria-label={`View ${product.name}`}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShopTheLook; 