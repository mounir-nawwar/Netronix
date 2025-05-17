import React, { useState, useEffect, useContext } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ShopContext } from '../context/ShopContext';
import axios from 'axios';
import { toast } from 'react-toastify';
import { FiShoppingBag } from 'react-icons/fi';
import earphones from '../assets/category_images/Earphones.jpg';
import gaming from '../assets/category_images/Gaming.jpg';
import laptops from '../assets/category_images/Laptops category.png';
import pc from '../assets/category_images/pc pic 2.png';

const FeaturedProduct = () => {
    const { backendUrl, addToCart } = useContext(ShopContext);
    const [currentImage, setCurrentImage] = useState(0);
    const [loading, setLoading] = useState(true);
    const [quantity, setQuantity] = useState(1);
    
    // State for product data
    const [product, setProduct] = useState(null);
    const productId = "680262846be92b2511550a66"; // Razer Cobra Mouse ID
    
    // For variant selection
    const [selectedVariants, setSelectedVariants] = useState({});
    
    useEffect(() => {
        const fetchProduct = async () => {
            try {
                setLoading(true);
                // Try the list endpoint instead of single product endpoint
                const response = await axios.get(`${backendUrl}/api/product/list`);
                
                if (response.data.success) {
                    // Find the product with matching ID from the list
                    const foundProduct = response.data.products.find(p => p._id === productId);
                    
                    if (foundProduct) {
                        setProduct(foundProduct);
                        
                        // Initialize selected variants
                        if (foundProduct.variants && foundProduct.variants.length > 0) {
                            const initialVariants = {};
                            foundProduct.variants.forEach(variant => {
                                if (variant.options && variant.options.length > 0) {
                                    initialVariants[variant.name] = variant.options[0]; // Select first option by default
                                }
                            });
                            setSelectedVariants(initialVariants);
                        }
                    } else {
                        // If product not found in the list, show error
                        toast.error("Product not found");
                        // Fallback to a mock product for display
                        setProduct({
                            name: "Razer Cobra Mouse",
                            brand: "Razer",
                            price: 79.99,
                            desc: "Advanced gaming mouse with precision optical sensor and customizable RGB lighting.",
                            image: [gaming],
                            variants: [
                                {
                                    name: "Color",
                                    options: ["Black", "White"]
                                }
                            ]
                        });
                        setSelectedVariants({ Color: "Black" });
                    }
                } else {
                    toast.error("Failed to fetch products");
                    // Use a fallback product
                    setProduct({
                        name: "Razer Cobra Mouse",
                        brand: "Razer",
                        price: 79.99,
                        desc: "Advanced gaming mouse with precision optical sensor and customizable RGB lighting.",
                        image: [gaming],
                        variants: [
                            {
                                name: "Color",
                                options: ["Black", "White"]
                            }
                        ]
                    });
                    setSelectedVariants({ Color: "Black" });
                }
                setLoading(false);
            } catch (error) {
                console.error("Error fetching product:", error);
                toast.error("Error loading product");
                // Use fallback product on error
                setProduct({
                    name: "Razer Cobra Mouse",
                    brand: "Razer",
                    price: 79.99,
                    desc: "Advanced gaming mouse with precision optical sensor and customizable RGB lighting.",
                    image: [gaming],
                    variants: [
                        {
                            name: "Color",
                            options: ["Black", "White"]
                        }
                    ]
                });
                setSelectedVariants({ Color: "Black" });
                setLoading(false);
            }
        };
        
        fetchProduct();
    }, [backendUrl]);
    
    // Calculate available stock for selected variant
    const getAvailableQuantity = () => {
        if (!product || !product.inventory) return 0;
        
        const variantKey = getVariantKey();
        if (!variantKey || !product.inventory[variantKey]) return 0;
        
        return product.inventory[variantKey];
    };
    
    const handleQuantityChange = (change) => {
        const newQuantity = quantity + change;
        const availableStock = getAvailableQuantity();
        
        // Don't allow quantity below 1
        if (newQuantity < 1) return;
        
        // Don't allow quantity above available stock
        if (availableStock > 0 && newQuantity > availableStock) {
            toast.warning(`Only ${availableStock} items available`);
            return;
        }
        
        setQuantity(newQuantity);
    };
    
    const handleVariantChange = (variantName, option) => {
        setSelectedVariants(prev => ({
            ...prev,
            [variantName]: option
        }));
    };
    
    // Generate variant key for cart
    const getVariantKey = () => {
        if (!product || !product.variants) return '';
        
        return product.variants
            .map(variant => selectedVariants[variant.name])
            .filter(option => option) // Filter out empty values
            .join('-');
    };
    
    const handleAddToCart = () => {
        const variantKey = getVariantKey();
        if (variantKey) {
            // Check available stock
            const availableStock = getAvailableQuantity();
            if (availableStock < quantity) {
                toast.error(`Only ${availableStock} items available`);
                return;
            }
            
            // Add to cart with selected quantity
            addToCart(productId, variantKey, quantity);
        } else {
            toast.error('Please select all options');
        }
    };
    
    // Get description from various possible field names
    const getDescription = () => {
        if (!product) return '';
        
        // Check various possible field names for description
        return product.desc || product.description || product.details || '';
    };
    
    if (loading) {
        return (
            <div className="py-16 flex justify-center items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6a5acd]"></div>
            </div>
        );
    }
    
    if (!product) {
        return null;
    }

    return (
        <section className="py-6 sm:py-8 md:py-16 px-4 sm:px-6 lg:px-8">
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
                                        <text className="font-michroma text-[9px] sm:text-[13px] fill-[#6a5acd] uppercase">
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
                                {product.image && product.image.map((img, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setCurrentImage(index)}
                                        className={`w-16 sm:w-20 aspect-square rounded-lg overflow-hidden ${
                                            currentImage === index ? 'ring-2 ring-black' : 'ring-1 ring-gray-200'
                                        }`}
                                    >
                                        <img
                                            src={img}
                                            alt={`${product.name} view ${index + 1}`}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Main Image */}
                        <div className="flex-1">
                            <div className="flex justify-center">
                                <img
                                    src={product.image && product.image[currentImage]}
                                    alt={product.name}
                                    className="rounded-lg"
                                    style={{ width: "auto", height: "auto", maxHeight: "500px" }}
                                    loading="lazy"
                                />
                            </div>
                            
                            {/* Mobile Thumbnails (horizontal scroll) */}
                            <div className="mt-6 flex sm:hidden gap-4 overflow-x-auto pb-4 px-1">
                                {product.image && product.image.map((img, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setCurrentImage(index)}
                                        className={`flex-shrink-0 w-16 aspect-square rounded-lg overflow-hidden ${
                                            currentImage === index ? 'ring-2 ring-black' : 'ring-1 ring-gray-200'
                                        }`}
                                        style={{ margin: '2px' }}
                                    >
                                        <img
                                            src={img}
                                            alt={`${product.name} view ${index + 1}`}
                                            className="w-full h-full object-cover"
                                            loading="lazy"
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
                                            className={`w-3 h-3 sm:w-4 sm:h-4 ${i < 5 ? 'text-yellow-400' : 'text-gray-200'}`}
                                            fill="currentColor"
                                            viewBox="0 0 20 20"
                                        >
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    ))}
                                </div>
                                <span className="text-xs sm:text-sm text-gray-500">5.0 (18 reviews)</span>
                            </div>
                        </div>

                        {/* Variant selection */}
                        {product.variants && product.variants.map((variant) => (
                            <div key={variant.name} className="mb-4 sm:mb-8">
                                <h3 className="font-michroma text-xs sm:text-sm text-gray-900">{variant.name}</h3>
                                <div className="mt-2 sm:mt-4 flex flex-wrap gap-2 sm:gap-3">
                                    {variant.options.map((option) => (
                                        <button
                                            key={option}
                                            onClick={() => handleVariantChange(variant.name, option)}
                                            className={`px-3 py-1 text-xs sm:text-sm rounded-full border ${
                                                selectedVariants[variant.name] === option
                                                    ? 'bg-[#6a5acd] text-white border-[#6a5acd]'
                                                    : 'border-gray-300 hover:border-[#6a5acd]'
                                            }`}
                                        >
                                            {option}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}

                        <div className="mb-4 sm:mb-8">
                            <p className="text-base sm:text-lg font-michroma text-gray-900">${product.price}</p>
                            
                            {/* Truncated product description with clamp for 3 lines max */}
                            <div className="mt-2 sm:mt-4">
                                <p className="text-xs sm:text-sm md:text-base text-gray-500 overflow-hidden line-clamp-3">
                                    {getDescription()}
                                </p>
                                {getDescription().length > 150 && (
                                    <Link 
                                        to={`/product/${productId}`}
                                        className="text-xs sm:text-sm text-[#6a5acd] hover:text-[#5a4cbb] hover:underline font-medium inline-flex items-center mt-1"
                                    >
                                        View Details
                                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                        </svg>
                                    </Link>
                                )}
                            </div>
                        </div>

                        <div className="mb-4 sm:mb-8">
                            <div className="flex items-center justify-between">
                                <h3 className="font-michroma text-xs sm:text-sm text-gray-900">Quantity</h3>
                                <div 
                                    className="w-24 sm:w-32 flex justify-between items-center border border-gray-300 rounded-full px-3 py-1 bg-white"
                                >
                                    <button 
                                        className="text-gray-500 focus:outline-none w-6 h-6 flex items-center justify-center"
                                        onClick={() => handleQuantityChange(-1)}
                                        type="button"
                                        aria-label="Decrease quantity"
                                    >
                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                        </svg>
                                    </button>
                                    <span className="text-xs sm:text-sm font-medium">{quantity}</span>
                                    <button 
                                        className="text-gray-500 focus:outline-none w-6 h-6 flex items-center justify-center"
                                        onClick={() => handleQuantityChange(1)}
                                        type="button"
                                        aria-label="Increase quantity"
                                    >
                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                            <button 
                                onClick={handleAddToCart}
                                className="fill-button fill-button-purple w-full py-3 sm:py-4 px-6 sm:px-8 rounded-full font-michroma text-xs sm:text-sm flex items-center justify-center gap-2 group"
                            >
                                <FiShoppingBag className="w-4 h-4 transform group-hover:translate-y-[-2px] transition-transform" />
                                Add to Cart
                            </button>
                            <Link 
                                to={`/product/${productId}`}
                                className="w-full py-3 sm:py-4 px-6 sm:px-8 rounded-full bg-gray-100 hover:bg-gray-200 transition text-xs sm:text-sm text-gray-900 font-michroma text-center"
                            >
                                View Details
                            </Link>
                        </div>

                        <div className="mt-6 sm:mt-8 grid grid-cols-3 gap-4">
                            <div className="flex flex-col items-center border border-gray-200 rounded-lg p-3 sm:p-4">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                </svg>
                                <span className="text-[10px] sm:text-xs text-center text-gray-700 font-michroma">Free Shipping</span>
                            </div>
                            <div className="flex flex-col items-center border border-gray-200 rounded-lg p-3 sm:p-4">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                </svg>
                                <span className="text-[10px] sm:text-xs text-center text-gray-700 font-michroma">2 Year Warranty</span>
                            </div>
                            <div className="flex flex-col items-center border border-gray-200 rounded-lg p-3 sm:p-4">
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                <span className="text-[10px] sm:text-xs text-center text-gray-700 font-michroma">30-Day Returns</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default FeaturedProduct; 