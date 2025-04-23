import React, { useState, useRef, useEffect, useContext, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ShopContext } from '../context/ShopContext';
import axios from 'axios';

// Import product images (you'll need to add these to your assets)
import laptopCategory from '../assets/category_images/Laptops category.png';
import pcCategory from '../assets/category_images/pc pic 2.png';
import macbookCategory from '../assets/category_images/m4 pro macbook.png';
import headphonesCategory from '../assets/category_images/Headphones.jpg';
import earphonesCategory from '../assets/category_images/Earphones.jpg';
import speakersCategory from '../assets/category_images/Speakers.jpg';
import accessoriesCategory from '../assets/category_images/Accessories.jpg';
import gamingCategory from '../assets/category_images/Gaming.jpg';

// Define the product IDs as requested
const featuredProductIds = {
  macbooks: ['680897a3a9a5ffb06b2e52c8', '6808d9f6c448f5e2e77e997e'],
  laptops: ['6808ddaf34c8892e5062bd29', '6808dad9fdc77f4147b302a6', '6808dbe6cf07408f2114c2e7', '6808dcbb34c8892e5062bd27'],
  pcs: ['6808c03e1ddc34906b982f3b', '6808beb09557fb4c91563b03', '6808bda4316fe0e95f32e6a7', '680898020051b67b74d7ab7c']
};

// Initial collections structure
const initialCollections = [
  {
    id: 1,
    title: "Latest Laptops",
    products: []
  },
  {
    id: 2,
    title: "Gaming PCs",
    products: []
  },
  {
    id: 3,
    title: "MacBooks",
    products: []
  },
];

const ProductCard = ({ product }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imageContainerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const [touchStart, setTouchStart] = useState(0);
  const { addToCart, navigate } = useContext(ShopContext);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleMouseMove = (e) => {
    if (isMobile) return;
    
    const { left, width } = imageContainerRef.current.getBoundingClientRect();
    const x = e.clientX - left;
    const section = width / 3;
    
    if (x < section) {
      setCurrentImageIndex(0);
    } else if (x < section * 2) {
      setCurrentImageIndex(1);
    } else {
      setCurrentImageIndex(2);
    }
  };

  const handleMouseLeave = () => {
    setCurrentImageIndex(0);
  };

  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchMove = (e) => {
    if (!touchStart) return;

    const currentTouch = e.touches[0].clientX;
    const diff = touchStart - currentTouch;

    if (Math.abs(diff) > 5) { // Add some threshold to prevent accidental swipes
      if (diff > 0) {
        // Swipe left
        setCurrentImageIndex(prev => (prev + 1) % 3);
      } else {
        // Swipe right
        setCurrentImageIndex(prev => (prev - 1 + 3) % 3);
      }
      setTouchStart(null);
    }
  };

  // Create an array of up to 3 different product images
  const productImages = useMemo(() => {
    if (product.image && product.image.length > 0) {
      // Use actual product images if available (up to 3)
      if (product.image.length >= 3) {
        return [product.image[0], product.image[1], product.image[2]];
      } else if (product.image.length === 2) {
        return [product.image[0], product.image[1], product.image[0]];
      } else {
        return [product.image[0], product.image[0], product.image[0]];
      }
    } else {
      // Fallback images based on category
      return [
        product.category === 'Laptops' ? laptopCategory : 
        product.category === 'PCs' ? pcCategory : 
        product.category === 'MacBooks' ? macbookCategory : 
        pcCategory // Default fallback
      ].fill(product.category === 'Laptops' ? laptopCategory : 
        product.category === 'PCs' ? pcCategory : 
        product.category === 'MacBooks' ? macbookCategory : 
        pcCategory, 0, 3);
    }
  }, [product]);

  const handleAddToCart = (e) => {
    e.stopPropagation(); // Prevent navigation when clicking add to cart
    // Default to first variant option if available
    let variantKey = '';
    if (product.variants && product.variants.length > 0) {
      variantKey = product.variants.map(v => v.options[0]).join('-');
    }
    
    addToCart(product._id, variantKey || 'default', 1);
  };

  const navigateToProduct = () => {
    navigate(`/product/${product._id}`);
  };

  return (
    <motion.div 
      className="product-card bg-[#f9f9f9] rounded-2xl overflow-hidden cursor-pointer group relative flex flex-col min-w-[120px] md:min-w-0"
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3 }}
      onClick={navigateToProduct}
    >
      <div 
        ref={imageContainerRef}
        className="relative aspect-square overflow-hidden bg-[#f9f9f9] w-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        <img
          src={productImages[currentImageIndex]}
          alt={product.name}
          className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
        />
      </div>

      {/* Image navigation dots */}
      <div className="flex justify-center gap-1 py-1 md:py-2">
        {[0, 1, 2].map((index) => (
          <button
            key={index}
            className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full transition-all ${
              currentImageIndex === index 
                ? 'bg-black' 
                : 'bg-gray-300'
            }`}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentImageIndex(index);
            }}
          />
        ))}
      </div>

      <div className="px-3 md:px-4 pb-3 md:pb-4">
        <div className="flex justify-between items-start mb-0.5 md:mb-1">
          <p className="text-[9px] md:text-sm text-gray-600 font-michroma">{product.brand || 'Brand'}</p>
          <div className="flex items-center">
            <span className="text-[#6a5acd] text-xs md:text-base">★</span>
            <span className="text-[9px] md:text-sm ml-0.5 md:ml-1">{product.rating || 4.5}</span>
          </div>
        </div>
        <h3 className="text-xs md:text-lg font-michroma text-gray-900 mb-1 md:mb-2 relative group-hover:after:w-full after:w-0 after:h-[2px] after:bg-[#6a5acd] after:absolute after:left-0 after:bottom-0 after:transition-all after:duration-300 truncate">
          {product.name}
        </h3>
        <p className="text-sm md:text-lg font-michroma text-[#6a5acd] mb-2 md:mb-3">${product.price}</p>
        
        {/* Add to Cart Button */}
        <button 
          className={`w-full py-1.5 md:py-2.5 px-2 md:px-4 rounded-[3px] font-michroma text-[8px] md:text-[12px] transition-all ${
            !product.inventory || Object.values(product.inventory).every(qty => qty <= 0)
              ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
              : 'fill-button fill-button-purple'
          }`}
          onClick={handleAddToCart}
          disabled={!product.inventory || Object.values(product.inventory).every(qty => qty <= 0)}
        >
          {!product.inventory || Object.values(product.inventory).every(qty => qty <= 0) ? 'Sold Out' : 'ADD TO CART'}
        </button>
      </div>
    </motion.div>
  );
};

const FeaturedProducts = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const sliderRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const [collections, setCollections] = useState(initialCollections);
  const [loading, setLoading] = useState(true);
  const { backendUrl } = useContext(ShopContext);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${backendUrl}/api/product/list`);
        
        if (response.data.success) {
          const allProducts = response.data.products;
          
          // Create collections with the specified product IDs
          const updatedCollections = [...initialCollections];
          
          // Fill MacBooks collection (index 2)
          updatedCollections[2].products = featuredProductIds.macbooks
            .map(id => allProducts.find(p => p._id === id))
            .filter(Boolean);
          
          // Fill Laptops collection (index 0)
          updatedCollections[0].products = featuredProductIds.laptops
            .map(id => allProducts.find(p => p._id === id))
            .filter(Boolean);
          
          // Fill PCs collection (index 1)
          updatedCollections[1].products = featuredProductIds.pcs
            .map(id => allProducts.find(p => p._id === id))
            .filter(Boolean);
          
          setCollections(updatedCollections);
        }
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProducts();
  }, [backendUrl]);

  const handleTabClick = (index) => {
    setActiveTab(index);
    setCurrentPage(1);
  };

  const handlePrevious = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({
        left: -sliderRef.current.offsetWidth,
        behavior: 'smooth'
      });
    }
  };

  const handleNext = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({
        left: sliderRef.current.offsetWidth,
        behavior: 'smooth'
      });
    }
  };

  return (
    <section className="py-12 md:py-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section Heading */}
        <div className="text-center mb-8 md:mb-12">
          <h2 className="text-2xl md:text-3xl md:text-[42px] font-michroma text-gray-900 mb-2 md:mb-4">
            Best Sellers
          </h2>
          <p className="text-sm md:text-base md:text-lg text-gray-600 max-w-3xl mx-auto font-michroma">
            Explore our curated selection of premium tech products designed for performance and reliability.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-between items-center mb-6 md:mb-8">
          <div 
            ref={tabsContainerRef}
            className="flex gap-2 md:gap-4 overflow-x-auto pb-4 max-w-full"
            style={{ 
              scrollbarWidth: 'none', 
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch',
              '::-webkit-scrollbar': { display: 'none' }
            }}
          >
            {collections.map((collection, index) => (
              <button
                key={collection.id}
                onClick={() => handleTabClick(index)}
                className={`px-4 md:px-6 py-2 md:py-3 rounded-full font-michroma text-xs md:text-base whitespace-nowrap flex-shrink-0 ${
                  activeTab === index 
                    ? 'bg-[#6a5acd] text-white' 
                    : 'fill-button fill-button-gray'
                }`}
              >
                {collection.title}
              </button>
            ))}
          </div>

          <div className="hidden lg:flex gap-2">
            <button
              onClick={handlePrevious}
              className="p-3 rounded-full bg-[#f9f9f9] text-[#6a5acd] hover:scale-110 transition-transform shadow-md"
              aria-label="Previous"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNext}
              className="p-3 rounded-full bg-[#f9f9f9] text-[#6a5acd] hover:scale-110 transition-transform shadow-md"
              aria-label="Next"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Product View */}
        <div className="md:hidden">
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="w-10 h-10 border-t-2 border-b-2 border-[#6a5acd] rounded-full animate-spin"></div>
            </div>
          ) : (
            <div 
              className="flex gap-4 overflow-x-auto pb-6 scroll-smooth snap-x"
              style={{ 
                scrollbarWidth: 'none', 
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch',
                '::-webkit-scrollbar': { display: 'none' }
              }}
            >
              {collections[activeTab].products.map((product) => (
                <div 
                  key={product._id} 
                  className="flex-shrink-0 snap-start"
                  style={{ width: 'calc((100% - 32px) / 2.15)' }} // Show 2 wider cards with just a peek of the third
                >
                  <ProductCard product={product} />
                </div>
              ))}
            </div>
          )}
          
          {/* Mobile Navigation Indicators */}
          <div className="flex justify-center gap-1 mt-2">
            {[...Array(Math.ceil(collections[activeTab].products?.length / 2 || 0))].map((_, index) => (
              <div 
                key={index}
                className={`w-1.5 h-1.5 rounded-full ${
                  Math.floor(currentPage / 2) === index 
                    ? 'bg-[#6a5acd]' 
                    : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Desktop Product Grid - Original Layout */}
        <div 
          ref={sliderRef}
          className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6 overflow-x-auto scroll-smooth"
        >
          {loading ? (
            <div className="col-span-4 py-12 flex justify-center">
              <div className="w-10 h-10 border-t-2 border-b-2 border-[#6a5acd] rounded-full animate-spin"></div>
            </div>
          ) : (
            collections[activeTab].products.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts; 