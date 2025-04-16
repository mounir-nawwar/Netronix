import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';

// Import product images (you'll need to add these to your assets)
import laptopCategory from '../assets/category_images/Laptops category.png';
import pcCategory from '../assets/category_images/pc pic 2.png';
import macbookCategory from '../assets/category_images/m4 pro macbook.png';
import headphonesCategory from '../assets/category_images/Headphones.jpg';
import earphonesCategory from '../assets/category_images/Earphones.jpg';
import speakersCategory from '../assets/category_images/Speakers.jpg';
import accessoriesCategory from '../assets/category_images/Accessories.jpg';
import gamingCategory from '../assets/category_images/Gaming.jpg';

// Product data structure
const collections = [
  {
    id: 1,
    title: "Latest Laptops",
    products: [
      {
        id: 1,
        title: "Dell XPS 15",
        price: "$1,499.99",
        image: laptopCategory,
        vendor: "Dell",
        rating: 4.5,
        status: 'in_stock'
      },
      {
        id: 2,
        title: "HP Spectre x360",
        price: "$1,299.99",
        image: laptopCategory,
        vendor: "HP",
        rating: 4.8,
        status: 'in_stock'
      },
    ]
  },
  {
    id: 2,
    title: "Gaming PCs",
    products: [
      {
        id: 3,
        title: "Alienware Aurora R12",
        price: "$2,199.99",
        image: pcCategory,
        vendor: "Alienware",
        rating: 4.7,
        status: 'in_stock'
      },
      {
        id: 4,
        title: "ROG Strix G15",
        price: "$1,899.99",
        image: pcCategory,
        vendor: "ASUS",
        rating: 4.6,
        status: 'in_stock'
      },
    ]
  },
  {
    id: 3,
    title: "MacBooks",
    products: [
      {
        id: 5,
        title: "MacBook Pro 16",
        price: "$2,499.99",
        image: macbookCategory,
        vendor: "Apple",
        rating: 4.9,
        status: 'in_stock'
      },
      {
        id: 6,
        title: "MacBook Air M2",
        price: "$1,199.99",
        image: macbookCategory,
        vendor: "Apple",
        rating: 4.8,
        status: 'in_stock'
      },
    ]
  },
];

const ProductCard = ({ product }) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const imageContainerRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);
  const [touchStart, setTouchStart] = useState(0);

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

  // Simulate multiple images for demo (you'll replace these with actual product images)
  const productImages = [
    product.image,
    product.image, // Replace with actual second image
    product.image, // Replace with actual third image
  ];

  return (
    <motion.div 
      className="product-card bg-[#f9f9f9] rounded-2xl overflow-hidden cursor-pointer group relative flex flex-col min-w-[120px] md:min-w-0"
      whileHover={{ y: -5 }}
      transition={{ duration: 0.3 }}
    >
      <div 
        ref={imageContainerRef}
        className="relative aspect-square overflow-hidden bg-[#f9f9f9]"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
      >
        <img
          src={productImages[currentImageIndex]}
          alt={product.title}
          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
          loading="lazy"
        />
      </div>

      {/* Image navigation dots */}
      <div className="flex justify-center gap-1 py-1 md:py-2">
        {productImages.map((_, index) => (
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
          <p className="text-[9px] md:text-sm text-gray-600 font-michroma">{product.vendor}</p>
          <div className="flex items-center">
            <span className="text-[#6a5acd] text-xs md:text-base">★</span>
            <span className="text-[9px] md:text-sm ml-0.5 md:ml-1">{product.rating}</span>
          </div>
        </div>
        <h3 className="text-xs md:text-lg font-michroma text-gray-900 mb-1 md:mb-2 relative group-hover:after:w-full after:w-0 after:h-[2px] after:bg-[#6a5acd] after:absolute after:left-0 after:bottom-0 after:transition-all after:duration-300 truncate">
          {product.title}
        </h3>
        <p className="text-sm md:text-lg font-michroma text-[#6a5acd] mb-2 md:mb-3">{product.price}</p>
        
        {/* Add to Cart Button */}
        <button 
          className={`w-full py-1.5 md:py-2.5 px-2 md:px-4 rounded-[3px] font-michroma text-[8px] md:text-[12px] transition-all ${
            product.status === 'sold_out'
              ? 'bg-gray-200 text-gray-600 cursor-not-allowed'
              : 'fill-button fill-button-purple'
          }`}
          onClick={(e) => e.stopPropagation()}
          disabled={product.status === 'sold_out'}
        >
          {product.status === 'sold_out' ? 'Sold Out' : 'ADD TO CART'}
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
                key={product.id} 
                className="flex-shrink-0 snap-start"
                style={{ width: 'calc((100% - 32px) / 2.15)' }} // Show 2 wider cards with just a peek of the third
              >
                <ProductCard product={product} />
              </div>
            ))}
          </div>
          
          {/* Mobile Navigation Indicators */}
          <div className="flex justify-center gap-1 mt-2">
            {[...Array(Math.ceil(collections[activeTab].products.length / 2))].map((_, index) => (
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
          {collections[activeTab].products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts; 