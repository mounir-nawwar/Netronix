import React, { useState } from 'react';
import { motion } from 'framer-motion';
import mainImage from '../assets/comparison/home-after.jpg';
import productImage from '../assets/category_images/Speakers.jpg';

const ShopTheLook = () => {
    const [activeProduct, setActiveProduct] = useState(0);

    const products = [
        {
            id: 0,
            name: 'Sonic Silhouette',
            brand: 'RESONANCE',
            price: 'LE1,027,013',
            rating: 5.0,
            image: productImage,
            position: { top: '50%', left: '33%' }
        },
        {
            id: 1,
            name: 'Acoustic Subwoofer',
            brand: 'RESONANCE',
            price: 'LE389,999',
            rating: 4.8,
            image: productImage, // Using same image for demo
            position: { top: '66%', right: '25%' }
        }
    ];

    return (
        <div className="w-full h-[80vh] py-16 bg-white px-10">
            <div className="container mx-auto px-4">
                <div className="flex flex-col lg:flex-row gap-20">
                    {/* Main Room Image Section with Title */}
                    <div className="w-full lg:w-[65%]">
                        <div className="relative rounded-lg overflow-hidden">
                            <img
                                src={mainImage}
                                alt="Premium home theater setup"
                                className="w-full h-[500px] md:h-[80vh] object-cover"
                            />

                            {/* Hotspots */}
                            {products.map((product) => (
                                <div
                                    key={product.id}
                                    className={`absolute w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center cursor-pointer transition-all duration-300 ${activeProduct === product.id ? 'ring-2 ring-black scale-110' : ''}`}
                                    style={product.position}
                                    onMouseEnter={() => setActiveProduct(product.id)}
                                    // Keep onClick for mobile devices
                                    onClick={() => setActiveProduct(product.id)}
                                >
                                    <span className={`w-4 h-4 rounded-full bg-black ${activeProduct === product.id ? 'scale-75' : ''} transition-transform`}></span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Current Product Card Section */}
                    <div className="w-full lg:w-[25%]">
                        <div className="space-y-4 mb-8">
                            <h2 className="text-4xl font-semibold">Bring Quality Sound into Your Home</h2>
                            <div className="w-24 h-1 bg-orange-200 mt-2"></div>
                        </div>

                        {/* Active Product Card - Sized like FeaturedProducts */}
                        <div className="max-w-sm mx-auto lg:mx-0">
                            <motion.div
                                className="product-card bg-[#f9f9f9] rounded-2xl overflow-hidden cursor-pointer group relative flex flex-col"
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

                                <div className="px-4 pb-4">
                                    <div className="flex justify-between items-start mb-1">
                                        <p className="text-sm text-gray-600 font-michroma">{products[activeProduct].brand}</p>
                                        <div className="flex items-center">
                                            <span className="text-[#6a5acd]">★</span>
                                            <span className="text-sm ml-1">{products[activeProduct].rating}</span>
                                        </div>
                                    </div>
                                    <h3 className="text-lg font-michroma text-gray-900 mb-2 relative group-hover:after:w-full after:w-0 after:h-[2px] after:bg-[#6a5acd] after:absolute after:left-0 after:bottom-0 after:transition-all after:duration-300">
                                        {products[activeProduct].name}
                                    </h3>
                                    <p className="text-lg font-michroma text-[#6a5acd] mb-3">{products[activeProduct].price}</p>

                                    {/* Add to Cart Button */}
                                    <button
                                        className="w-full py-2.5 px-4 rounded-[3px] font-michroma text-[12px] transition-all fill-button fill-button-purple"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        ADD TO CART
                                    </button>
                                </div>
                            </motion.div>

                            {/* Navigation Dots */}
                            <div className="flex justify-center mt-6 gap-2">
                                {products.map((product) => (
                                    <button
                                        key={product.id}
                                        className={`w-2 h-2 rounded-full transition-all duration-300 ${activeProduct === product.id ? 'bg-black w-3 h-3' : 'bg-gray-300'
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