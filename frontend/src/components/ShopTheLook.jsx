import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import mainImage from '../assets/ShopTheLook/ShopTheLook.jpeg';
import productImage from '../assets/category_images/Speakers.jpg';
import headphonesImage from '../assets/category_images/Headphones.jpg';
import laptopImage from '../assets/category_images/Laptops category.png';

const ShopTheLook = () => {
    const [activeProduct, setActiveProduct] = useState(0);
    const [imageHeight, setImageHeight] = useState(0);
    const imageRef = useRef(null);

    // Update image height on resize
    useEffect(() => {
        const updateHeight = () => {
            if (imageRef.current) {
                setImageHeight(imageRef.current.clientHeight);
            }
        };

        // Initial height
        updateHeight();

        // Update on resize
        window.addEventListener('resize', updateHeight);

        // Cleanup
        return () => window.removeEventListener('resize', updateHeight);
    }, []);

    const products = [
        {
            id: 0,
            name: 'Monitor',
            brand: 'RESONANCE',
            price: 'LE1,027,013',
            rating: 5.0,
            image: productImage,
            position: { top: '38%', left: '50%' }
        },
        {
            id: 1,
            name: 'Mac',
            brand: 'RESONANCE',
            price: 'LE389,999',
            rating: 4.8,
            image: productImage,
            position: { top: '50%', left: '25%' }
        },
        {
            id: 2,
            name: 'Headphones',
            brand: 'AUDIOTREK',
            price: 'LE299,999',
            rating: 4.9,
            image: headphonesImage,
            position: { top: '45%', left: '70%' }
        },
        {
            id: 3,
            name: 'Keyboard',
            brand: 'NEXTECH',
            price: 'LE799,999',
            rating: 4.7,
            image: laptopImage,
            position: { top: '70%', left: '41%' }
        }
    ];

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
                                src={mainImage}
                                alt="Premium workspace setup"
                                className="w-full h-full object-cover"
                            />

                            {/* Hotspots with pulsing animation - Smaller on mobile */}
                            {products.map((product) => (
                                <div
                                    key={product.id}
                                    className={`absolute w-6 h-6 md:w-8 md:h-8 rounded-full bg-white shadow-lg flex items-center justify-center cursor-pointer transition-all duration-300 ${activeProduct === product.id ? 'ring-2 ring-black scale-110' : ''}`}
                                    style={{
                                        ...product.position,
                                        transform: 'translate(-50%, -50%)'
                                    }}
                                    onMouseEnter={() => setActiveProduct(product.id)}
                                    onClick={() => setActiveProduct(product.id)}
                                >
                                    <span className={`w-3 h-3 md:w-4 md:h-4 rounded-full bg-black ${activeProduct === product.id ? 'scale-75' : ''} transition-transform`}></span>

                                    {/* Pulsing animation ring */}
                                    <span className={`absolute w-full h-full rounded-full ${activeProduct === product.id ? 'animate-ping opacity-30 bg-[#6a5acd]' : ''}`}></span>
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
                        {/* Active Product Card - Sized like FeaturedProducts */}
                        <div className="w-full flex-grow flex flex-col">
                            <motion.div
                                className="product-card bg-[#f9f9f9] rounded-2xl overflow-hidden cursor-pointer group relative flex flex-col flex-grow shadow-md"
                                whileHover={{ y: -5 }}
                                transition={{ duration: 0.3 }}
                            >
                                <div className="relative aspect-square overflow-hidden bg-[#f9f9f9]">
                                    <img
                                        src={products[activeProduct].image}
                                        alt={products[activeProduct].name}
                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                </div>

                                <div className="px-3 md:px-4 pb-3 md:pb-4 flex-grow flex flex-col justify-between">
                                    <div>
                                        <div className="flex justify-between items-start mb-1">
                                            <p className="text-xs md:text-sm text-gray-600 font-michroma">{products[activeProduct].brand}</p>
                                            <div className="flex items-center">
                                                <span className="text-[#6a5acd]">★</span>
                                                <span className="text-xs md:text-sm ml-1">{products[activeProduct].rating}</span>
                                            </div>
                                        </div>
                                        <h3 className="text-sm md:text-lg font-michroma text-gray-900 mb-1 md:mb-2 relative group-hover:after:w-full after:w-0 after:h-[2px] after:bg-[#6a5acd] after:absolute after:left-0 after:bottom-0 after:transition-all after:duration-300">
                                            {products[activeProduct].name}
                                        </h3>
                                        <p className="text-base md:text-lg font-michroma text-[#6a5acd] mb-2 md:mb-3">{products[activeProduct].price}</p>
                                    </div>

                                    {/* Add to Cart Button */}
                                    <button
                                        className="w-full py-2 md:py-2.5 px-3 md:px-4 rounded-[3px] font-michroma text-[10px] md:text-[12px] transition-all fill-button fill-button-purple"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        ADD TO CART
                                    </button>
                                </div>
                            </motion.div>

                            {/* Navigation Dots */}
                            <div className="flex justify-center mt-3 md:mt-4 mb-2 gap-2">
                                {products.map((product) => (
                                    <button
                                        key={product.id}
                                        className={`w-2 h-2 rounded-full transition-all duration-300 shadow-md ${activeProduct === product.id
                                                ? 'bg-[#6a5acd] w-3 h-3 shadow-[#6a5acd]/50'
                                                : 'bg-gray-300'
                                            }`}
                                        onClick={() => setActiveProduct(product.id)}
                                        aria-label={`View ${product.name}`}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ShopTheLook; 