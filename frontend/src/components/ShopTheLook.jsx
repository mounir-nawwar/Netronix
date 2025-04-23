import React, { useState, useRef, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { ShopContext } from '../context/ShopContext';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import mainImage from '../assets/ShopTheLook/ShopTheLook.jpeg';
import productImage from '../assets/category_images/Speakers.jpg';
import headphonesImage from '../assets/category_images/Headphones.jpg';
import laptopImage from '../assets/category_images/Laptops category.png';
import monitorImage from '../assets/category_images/pc pic 2.png';

// Define the specific product IDs as requested
const productIds = {
    macbook: '680897a3a9a5ffb06b2e52c8',
    keyboard: '6808d7d6cb9e1085777db07c',
    headset: '6808e09934c8892e5062bd3b',
    monitor: '6809028550ea8406eae4b442'
};

const ShopTheLook = () => {
    const [activeProduct, setActiveProduct] = useState(0);
    const [imageHeight, setImageHeight] = useState(0);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const imageRef = useRef(null);
    const { backendUrl, addToCart } = useContext(ShopContext);
    const navigate = useNavigate();

    // Initial positions for hotspots
    const productPositions = [
        { top: '38%', left: '50%' }, // Monitor
        { top: '50%', left: '25%' }, // MacBook
        { top: '45%', left: '70%' }, // Headset
        { top: '70%', left: '41%' }  // Keyboard
    ];

    // Fetch products from backend
    useEffect(() => {
        const fetchProducts = async () => {
            try {
                setLoading(true);
                const response = await axios.get(`${backendUrl}/api/product/list`);
                
                if (response.data.success) {
                    const allProducts = response.data.products;
                    
                    // Find the specific products by ID
                    const monitorProduct = allProducts.find(p => p._id === productIds.monitor);
                    const macbookProduct = allProducts.find(p => p._id === productIds.macbook);
                    const headsetProduct = allProducts.find(p => p._id === productIds.headset);
                    const keyboardProduct = allProducts.find(p => p._id === productIds.keyboard);
                    
                    // Create the product array with positions
                    const productArray = [
                        { ...monitorProduct, position: productPositions[0] },
                        { ...macbookProduct, position: productPositions[1] },
                        { ...headsetProduct, position: productPositions[2] },
                        { ...keyboardProduct, position: productPositions[3] }
                    ].filter(Boolean); // Remove any undefined products
                    
                    setProducts(productArray);
                }
            } catch (error) {
                console.error("Error fetching products:", error);
            } finally {
                setLoading(false);
            }
        };
        
        fetchProducts();
    }, [backendUrl]);

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

    // Handle adding product to cart
    const handleAddToCart = (product, e) => {
        e.stopPropagation();
        if (!product) return;
        
        // Default to first variant option if available
        let variantKey = '';
        if (product.variants && product.variants.length > 0) {
            variantKey = product.variants.map(v => v.options[0]).join('-');
        }
        
        addToCart(product._id, variantKey || 'default', 1);
    };

    // Fallback placeholder products when loading
    const placeholderProducts = [
        {
            _id: '1',
            name: 'Monitor',
            brand: 'Loading...',
            price: 0,
            rating: 5.0,
            image: [monitorImage],
            position: productPositions[0]
        },
        {
            _id: '2',
            name: 'MacBook',
            brand: 'Loading...',
            price: 0,
            rating: 4.8,
            image: [laptopImage],
            position: productPositions[1]
        },
        {
            _id: '3',
            name: 'Headset',
            brand: 'Loading...',
            price: 0,
            rating: 4.9,
            image: [headphonesImage],
            position: productPositions[2]
        },
        {
            _id: '4',
            name: 'Keyboard',
            brand: 'Loading...',
            price: 0,
            rating: 4.7,
            image: [laptopImage],
            position: productPositions[3]
        }
    ];

    // Use loaded products or placeholders if still loading
    const displayProducts = products.length > 0 ? products : placeholderProducts;

    // Get appropriate product image
    const getProductImage = (product) => {
        if (product.image && product.image.length > 0) {
            return product.image[0];
        }
        
        // Fallback images based on product name
        if (product.name.toLowerCase().includes('monitor')) return monitorImage;
        if (product.name.toLowerCase().includes('mac')) return laptopImage;
        if (product.name.toLowerCase().includes('head')) return headphonesImage;
        if (product.name.toLowerCase().includes('keyboard')) return productImage;
        
        return productImage; // Default fallback
    };

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
                            {displayProducts.map((product, index) => (
                                <div
                                    key={product._id || index}
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
                        {/* Active Product Card - Sized like FeaturedProducts */}
                        {displayProducts.length > activeProduct && (
                            <div className="w-full flex-grow flex flex-col">
                                <motion.div
                                    className="product-card bg-[#f9f9f9] rounded-2xl overflow-hidden cursor-pointer group relative flex flex-col flex-grow shadow-md"
                                    whileHover={{ y: -5 }}
                                    transition={{ duration: 0.3 }}
                                    onClick={() => displayProducts[activeProduct]?._id && navigate(`/product/${displayProducts[activeProduct]._id}`)}
                                >
                                    <div className="relative h-64 mb-3">
                                        <img
                                            src={getProductImage(displayProducts[activeProduct])}
                                            alt={displayProducts[activeProduct].name}
                                            className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
                                            loading="lazy"
                                        />
                                    </div>

                                    <div className="px-3 md:px-4 pb-3 md:pb-4 flex-grow flex flex-col justify-between">
                                        <div>
                                            <div className="flex justify-between items-start mb-1">
                                                <p className="text-xs md:text-sm text-gray-600 font-michroma">{displayProducts[activeProduct].brand || 'Brand'}</p>
                                                <div className="flex items-center">
                                                    <span className="text-[#6a5acd]">★</span>
                                                    <span className="text-xs md:text-sm ml-1">{displayProducts[activeProduct].rating || 4.5}</span>
                                                </div>
                                            </div>
                                            <h3 className="text-sm md:text-lg font-michroma text-gray-900 mb-1 md:mb-2 relative group-hover:after:w-full after:w-0 after:h-[2px] after:bg-[#6a5acd] after:absolute after:left-0 after:bottom-0 after:transition-all after:duration-300">
                                                {displayProducts[activeProduct].name}
                                            </h3>
                                            <p className="text-base md:text-lg font-michroma text-[#6a5acd] mb-2 md:mb-3">
                                                ${displayProducts[activeProduct].price}
                                            </p>
                                        </div>

                                        {/* Add to Cart Button */}
                                        <button
                                            className={`w-full py-2 md:py-2.5 px-3 md:px-4 rounded-[3px] font-michroma text-[10px] md:text-[12px] transition-all ${
                                                loading || !displayProducts[activeProduct]._id
                                                ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
                                                : 'fill-button fill-button-purple'
                                            }`}
                                            onClick={(e) => handleAddToCart(displayProducts[activeProduct], e)}
                                            disabled={loading || !displayProducts[activeProduct]._id}
                                        >
                                            {loading ? 'LOADING...' : 'ADD TO CART'}
                                        </button>
                                    </div>
                                </motion.div>

                                {/* Navigation Dots */}
                                <div className="flex justify-center mt-3 md:mt-4 mb-2 gap-2">
                                    {displayProducts.map((product, index) => (
                                        <button
                                            key={product._id || index}
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