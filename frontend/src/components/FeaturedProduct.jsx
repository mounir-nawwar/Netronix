import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import earphones from '../assets/category_images/Earphones.jpg';
import gaming from '../assets/category_images/Gaming.jpg';
import laptops from '../assets/category_images/Laptops category.png';
import pc from '../assets/category_images/pc pic 2.png';

const FeaturedProduct = () => {
    const [currentImage, setCurrentImage] = useState(0);
    const [selectedColor, setSelectedColor] = useState('Gold Tone');
    const [quantity, setQuantity] = useState(1);

    const product = {
        name: "Flow Harmony",
        brand: "SonicPulse",
        price: "£91,199,000.00",
        rating: 5,
        reviews: 2,
        description: "Experience a harmonious blend of premium sound quality and ergonomic design that allows for all-day comfortable listening.",
        colors: [
            { name: 'Gold Tone', image: earphones },
            { name: 'Shadow Black', image: gaming },
            { name: 'Crimson Red', image: laptops },
            { name: 'Ocean Blue', image: pc },
            { name: 'Steel Grey', image: earphones }
        ],
        images: [
            earphones,
            gaming,
            laptops,
            pc
        ],
        inStock: true,
        stockCount: 12
    };

    const handleQuantityChange = (change) => {
        const newQuantity = quantity + change;
        if (newQuantity >= 1) {
            setQuantity(newQuantity);
        }
    };

    return (
        <section className="py-8 sm:py-12 md:py-16 px-4 sm:px-6 lg:px-8">
            <style jsx>{`
                @keyframes spin {
                    0% {
                        transform: rotate(0deg);
                    }
                    100% {
                        transform: rotate(360deg);
                    }
                }
                
                .badge {
                    position: relative;
                    width: 70px;
                    height: 70px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                
                @media (min-width: 640px) {
                    .badge {
                        width: 100px;
                        height: 100px;
                    }
                }
                
                .circle-text {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    animation: spin 20s linear infinite;
                }
                
                .circle-text svg {
                    overflow: visible;
                }
                
                .badge-icon {
                    position: absolute;
                    z-index: 10;
                    width: 24px;
                    height: 24px;
                }
                
                @media (min-width: 640px) {
                    .badge-icon {
                        width: 36px;
                        height: 36px;
                    }
                }
                
                .thumbnail-container {
                    display: flex;
                    flex-direction: column;
                    overflow-y: auto;
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }
                
                .thumbnail-container::-webkit-scrollbar {
                    display: none;
                }
            `}</style>
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.8fr] gap-6 md:gap-12">
                    {/* Media Section */}
                    <div className="relative flex gap-4">
                        {/* Featured Badge */}
                        <div className="absolute -top-4 -right-4 sm:-top-8 sm:-right-8 z-10">
                            <div className="badge">
                                <div className="circle-text">
                                    <svg viewBox="0 0 100 100" width="100%" height="100%">
                                        <defs>
                                            <path
                                                id="circle"
                                                d="M 50, 50
                                                   m -42, 0
                                                   a 42,42 0 1,1 84,0
                                                   a 42,42 0 1,1 -84,0"
                                                fill="none"
                                            />
                                        </defs>
                                        <text className="font-michroma text-[9px] sm:text-[13px] fill-black uppercase">
                                            <textPath href="#circle" startOffset="0%" lengthAdjust="spacing" textLength="260">
                                                F E A T U R E D • P R O D U C T • 
                                            </textPath>
                                        </text>
                                    </svg>
                                </div>
                                <div className="badge-icon">
                                    <svg viewBox="0 0 41 41" stroke="currentColor" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.486 31.8298C17.486 31.8298 19.6732 33.5701 21.9404 32.5164C23.3536 31.8596 28.2906 29.565 31.8091 27.9298C33.1341 27.3139 33.7966 27.006 34.2191 26.5148C34.5915 26.0818 34.8326 25.5515 34.914 24.9862C35.0063 24.3449 34.8027 23.6431 34.3954 22.2395L32.5204 15.7778C31.9832 13.9266 31.7146 13.0009 31.1459 12.4479C30.6466 11.9626 29.9941 11.6659 29.3002 11.6089C28.5095 11.544 27.6355 11.9502 25.8875 12.7626L24.0932 13.5965C23.3585 13.938 22.9912 14.1087 22.6896 14.0608C22.426 14.0189 22.1901 13.8733 22.0344 13.6566C21.8563 13.4086 21.844 13.0037 21.8196 12.1938L21.7051 8.40173C21.698 8.16642 21.6945 8.04876 21.6844 7.96256C21.5339 6.6814 20.2279 5.87567 19.0154 6.31596C18.9338 6.34559 18.827 6.3952 18.6136 6.49442V6.49442C18.5811 6.50949 18.5649 6.51702 18.5496 6.52482C18.3343 6.63405 18.1658 6.81746 18.0752 7.04121C18.0687 7.05719 18.0626 7.07397 18.0503 7.10755L12.7445 21.6278M12.9518 33.9372L8.21028 23.7352C7.62835 22.4831 8.17162 20.9963 9.42371 20.4144V20.4144C10.6758 19.8325 12.1626 20.3758 12.7445 21.6278L17.486 31.8298C18.0679 33.0819 17.5247 34.5687 16.2726 35.1506V35.1506C15.0205 35.7325 13.5337 35.1893 12.9518 33.9372Z"></path>
                                    </svg>
                                </div>
                            </div>
                        </div>

                        {/* Main Image */}
                        <div className="hidden sm:block">
                            {/* Thumbnails for non-mobile */}
                            <div className="thumbnail-container h-full flex flex-col gap-4">
                                {product.images.map((image, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setCurrentImage(index)}
                                        className={`w-16 sm:w-20 aspect-square rounded-lg overflow-hidden ${
                                            currentImage === index ? 'ring-2 ring-black' : 'ring-1 ring-gray-200'
                                        }`}
                                    >
                                        <img
                                            src={image}
                                            alt={`${product.name} view ${index + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Main Image */}
                        <div className="flex-1">
                            <div className="aspect-square overflow-hidden rounded-lg bg-gray-100">
                                <img
                                    src={product.images[currentImage]}
                                    alt={product.name}
                                    className="w-full h-full object-cover"
                                />
                            </div>
                            
                            {/* Mobile Thumbnails (horizontal scroll) */}
                            <div className="mt-6 flex sm:hidden gap-4 overflow-x-auto pb-4 px-1">
                                {product.images.map((image, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setCurrentImage(index)}
                                        className={`flex-shrink-0 w-16 aspect-square rounded-lg overflow-hidden ${
                                            currentImage === index ? 'ring-2 ring-black' : 'ring-1 ring-gray-200'
                                        }`}
                                        style={{ margin: '2px' }}
                                    >
                                        <img
                                            src={image}
                                            alt={`${product.name} view ${index + 1}`}
                                            className="w-full h-full object-cover"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Product Info */}
                    <div className="flex flex-col mt-6 lg:mt-0">
                        <div className="mb-4 sm:mb-6">
                            <h2 className="text-xs sm:text-sm font-michroma text-gray-500">{product.brand}</h2>
                            <h1 className="mt-1 sm:mt-2 text-xl sm:text-2xl md:text-3xl font-michroma text-gray-900">{product.name}</h1>
                            <div className="mt-1 sm:mt-2 flex items-center gap-2">
                                <div className="flex items-center">
                                    {[...Array(5)].map((_, i) => (
                                        <svg
                                            key={i}
                                            className={`w-3 h-3 sm:w-4 sm:h-4 ${i < product.rating ? 'text-yellow-400' : 'text-gray-200'}`}
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    ))}
                                </div>
                                <span className="text-xs sm:text-sm text-gray-500">{product.reviews} reviews</span>
                            </div>
                        </div>

                        <div className="mb-4 sm:mb-8">
                            <h3 className="font-michroma text-xs sm:text-sm text-gray-900">Color</h3>
                            <div className="mt-2 sm:mt-4 flex flex-wrap gap-2 sm:gap-3">
                                {product.colors.map((color) => (
                                    <button
                                        key={color.name}
                                        onClick={() => setSelectedColor(color.name)}
                                        className={`relative w-12 h-12 sm:w-16 sm:h-16 rounded-lg ${
                                            selectedColor === color.name
                                                ? 'ring-2 ring-black'
                                                : 'ring-1 ring-gray-200'
                                        }`}
                                    >
                                        <img
                                            src={color.image}
                                            alt={color.name}
                                            className="w-full h-full object-cover rounded-lg"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="mb-4 sm:mb-8">
                            <p className="text-base sm:text-lg font-michroma text-gray-900">{product.price}</p>
                            <p className="mt-2 sm:mt-4 text-xs sm:text-sm md:text-base text-gray-500">{product.description}</p>
                        </div>

                        <div className="mb-4 sm:mb-8">
                            <div className="flex items-center justify-between">
                                <h3 className="font-michroma text-xs sm:text-sm text-gray-900">Quantity</h3>
                                <div className="flex items-center border border-gray-200 rounded-md">
                                    <button
                                        onClick={() => handleQuantityChange(-1)}
                                        className="px-3 sm:px-4 py-1 sm:py-2 text-gray-600 hover:text-gray-700"
                                    >
                                        -
                                    </button>
                                    <span className="px-3 sm:px-4 py-1 sm:py-2 text-sm sm:text-base text-gray-900">{quantity}</span>
                                    <button
                                        onClick={() => handleQuantityChange(1)}
                                        className="px-3 sm:px-4 py-1 sm:py-2 text-gray-600 hover:text-gray-700"
                                    >
                                        +
                                    </button>
                                </div>
                            </div>
                        </div>

                        {product.inStock ? (
                            <div className="text-xs sm:text-sm text-green-600 mb-3 sm:mb-4">
                                Hurry, only {product.stockCount} items left in stock!
                            </div>
                        ) : (
                            <div className="text-xs sm:text-sm text-red-600 mb-3 sm:mb-4">Out of stock</div>
                        )}

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full bg-black text-white border border-black font-michroma py-3 sm:py-4 rounded-md text-sm sm:text-base transition-colors fill-button fill-button-black-white"
                        >
                            Add to cart
                        </motion.button>

                        <div className="mt-3 sm:mt-4 text-xs sm:text-sm text-gray-500">
                            <div className="flex items-center gap-1 sm:gap-2">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Usually ready in 24 hours</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default FeaturedProduct; 