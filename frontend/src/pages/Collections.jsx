import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ShopContext } from '../context/shopContext';
import { Link, useParams, useNavigate } from 'react-router-dom';
import Seo from '../components/Seo';
import { breadcrumbLd } from '../lib/seo';
import { motion, AnimatePresence } from 'framer-motion';
import { FiShoppingBag, FiFilter, FiChevronDown, FiX, FiGrid, FiList, FiSliders } from 'react-icons/fi';

import ProductCard from '../components/ProductCard';
import { catalogPriceCeiling, filterProducts, sortProducts, tagsOf } from '../lib/catalog';

// FE-003 — this page filtered and sorted on fields the schema does not have.
//
// The type filter read `item.category`, the sidebar's checkbox list was derived
// from the same field, "newest" sorted on `item.createdAt`, and the price
// ceiling was the literal `1000` — written into the state, into the slider's
// `max`, and into the percentage arithmetic that positions the track. Products
// are categorised by `tags`; "newest" is `date`, a number of epoch milliseconds;
// and the ceiling is a property of the catalog.
//
// The practical effect of the last one was that `/collections/all` — the
// destination of the empty cart's own call to action — hid every product over
// $1,000, in a catalog whose laptops start at $1,149.
//
// FE-007 — the 121-line `ProductCard` that used to live at the top of this file
// is gone. It fabricated three images by repeating `image[0]` and read
// `product.vendor`, a field that has never existed. Every tiled surface now
// renders `components/ProductCard`.
//
// The filtering itself is in `lib/catalog.js`, as pure functions over data.
// Visual design is untouched.

const Collections = () => {
  const { type } = useParams();
  const navigate = useNavigate();
  const { products, tags, catalogStatus, catalogError, reloadCatalog, formatPrice, getPriceMinor } =
    useContext(ShopContext);
  const [showFilters, setShowFilters] = useState(false);
  const [viewType, setViewType] = useState('grid'); // 'grid' or 'list'
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  // The ceiling is derived from the whole catalog, so a $2,500 laptop is
  // reachable and the slider's geometry agrees with the filter's arithmetic.
  const maxPrice = useMemo(() => catalogPriceCeiling(products), [products]);

  // Filter states. `null` means "not yet touched", which is how the range
  // follows the catalog until the customer moves a handle themselves.
  const [priceRange, setPriceRange] = useState(null);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [sortBy, setSortBy] = useState('newest');

  // Destructured so the memo dependencies below are plain values rather than a
  // fresh array identity on every render.
  const [minSelected, maxSelected] = priceRange ?? [0, maxPrice];
  const effectiveRange = useMemo(() => [minSelected, maxSelected], [minSelected, maxSelected]);

  /**
   * The taxonomy, from the real tags (FE-010).
   *
   * Preferring the `/product/tags` endpoint the context already fetched, and
   * falling back to the tags present in the loaded catalog. Neither invents a
   * category: the sidebar used to derive its list from `item.category` and was
   * therefore always empty, and `AllProducts` compensated by injecting about
   * forty hardcoded category names that matched no product at all.
   */
  const categories = useMemo(
    () => (tags?.length > 0 ? [...tags].sort() : tagsOf(products)),
    [tags, products],
  );

  const filteredProducts = useMemo(
    () => sortProducts(
      filterProducts(products, { type, priceRange: effectiveRange, tags: selectedCategories }),
      sortBy,
    ),
    [products, type, effectiveRange, selectedCategories, sortBy],
  );

  const isLoading = catalogStatus === 'loading';
  const hasFailed = catalogStatus === 'error';

  // Refs for the slider
  const minPriceRef = useRef(null);
  const maxPriceRef = useRef(null);
  const rangeRef = useRef(null);
  const trackRef = useRef(null);

  // Listen for resize events
    useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Keep filters always visible on desktop
    useEffect(() => {
    if (isDesktop) {
      setShowFilters(true);
    }
  }, [isDesktop]);

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 24
      }
    }
  };

  // Update price range slider UI. The percentages use the same derived maximum
  // the inputs do, so the track cannot disagree with the handles.
  useEffect(() => {
    if (!minPriceRef.current || !maxPriceRef.current || !trackRef.current || !rangeRef.current) return;
    if (maxPrice <= 0) return;

    const minPercent = (effectiveRange[0] / maxPrice) * 100;
    const maxPercent = (effectiveRange[1] / maxPrice) * 100;

    trackRef.current.style.left = `${minPercent}%`;
    trackRef.current.style.width = `${maxPercent - minPercent}%`;
  }, [effectiveRange, maxPrice]);

  const handlePriceChange = (index, value) => {
    const newRange = [...effectiveRange];

    // Make sure min can't exceed max, and max can't go below min
    if (index === 0) { // Min price
      newRange[0] = Math.min(value, effectiveRange[1]);
    } else { // Max price
      newRange[1] = Math.max(value, effectiveRange[0]);
    }

    setPriceRange(newRange);
  };

  const toggleCategory = (category) => {
    if (!category) return;
    
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category));
        } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const clearFilters = () => {
    // Back to "not touched", so the range follows the catalog again.
    setPriceRange(null);
    setSelectedCategories([]);
    setSortBy('newest');
  };

    return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 px-4 sm:px-6 lg:px-8 py-12 pt-[80px] md:pt-[100px]">
      {/* SEO-002 / SEO-004 / SEO-005 — a typed collection gets its own title,
          its own description and its own canonical, where every collection
          used to share the single string "Netronix". The breadcrumb is the one
          structured-data type this page can state as fact. */}
      <Seo
        title={type ? `${type}` : 'Collections'}
        description={
          type
            ? `Browse ${type} at Netronix — with real stock per variant.`
            : 'Every Netronix collection: laptops, gaming PCs, MacBooks, audio and accessories.'
        }
        path={type ? `/collections/${type}` : '/collections'}
        jsonLd={[
          breadcrumbLd(
            type
              ? [
                { name: 'Home', path: '/' },
                { name: 'Collections', path: '/collections' },
                { name: type, path: `/collections/${type}` },
              ]
              : [
                { name: 'Home', path: '/' },
                { name: 'Collections', path: '/collections' },
              ],
          ),
        ]}
      />
      <motion.div 
        className="max-w-7xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Header section */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <motion.h1 
              className="text-3xl font-bold text-gray-900 capitalize"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              {type === 'all' ? 'All Products' : type || 'Products'}
            </motion.h1>
            <p className="text-gray-600 mt-2">
              {filteredProducts.length} products
            </p>
          </div>
          
          {/* Sort controls - Always visible on desktop */}
          <div className="flex items-center gap-4">
            <div className="hidden lg:flex items-center gap-2">
              <button 
                onClick={() => setViewType('grid')}
                className={`p-2 rounded-lg transition-colors ${viewType === 'grid' ? 'bg-[#6a5acd] text-white' : 'bg-white text-gray-700 hover:bg-[#f5f3ff] fill-button border border-gray-300'}`}
                aria-label="Grid view"
              >
                <FiGrid className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setViewType('list')}
                className={`p-2 rounded-lg transition-colors ${viewType === 'list' ? 'bg-[#6a5acd] text-white' : 'bg-white text-gray-700 hover:bg-[#f5f3ff] fill-button border border-gray-300'}`}
                aria-label="List view"
              >
                <FiList className="w-5 h-5" />
              </button>
            </div>
            
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value)}
              className="px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent"
            >
              <option value="newest">Newest</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
            </select>
          </div>
        </div>

        {/* Mobile Controls bar */}
        <div className="lg:hidden mb-6 flex flex-wrap justify-between items-center gap-4">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm fill-button text-[#6a5acd] hover:text-white hover:bg-[#6a5acd] hover:border-[#6a5acd] transition-colors"
            >
              <FiFilter className="w-4 h-4" />
              <span>Filters</span>
              <FiChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
            
            {(selectedCategories.length > 0 || effectiveRange[0] > 0 || effectiveRange[1] < maxPrice) && (
              <button 
                onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-2 text-sm text-[#6a5acd] hover:text-[#5d4ebd] transition-colors fill-button"
              >
                <FiX className="w-4 h-4" />
                <span>Clear filters</span>
              </button>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setViewType('grid')}
              className={`p-2 rounded-lg transition-colors ${viewType === 'grid' ? 'bg-[#6a5acd] text-white' : 'bg-white text-gray-700 hover:bg-[#f5f3ff] fill-button border border-gray-300'}`}
              aria-label="Grid view"
            >
              <FiGrid className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setViewType('list')}
              className={`p-2 rounded-lg transition-colors ${viewType === 'list' ? 'bg-[#6a5acd] text-white' : 'bg-white text-gray-700 hover:bg-[#f5f3ff] fill-button border border-gray-300'}`}
              aria-label="List view"
            >
              <FiList className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Main content area with filters and products */}
        <div className="lg:flex lg:gap-8 lg:items-start">
          {/* Filters sidebar - Vertical on desktop */}
          <AnimatePresence>
            {showFilters && (
              <motion.div 
                className={`${isDesktop ? 'lg:w-64 sticky top-24 self-start' : 'w-full'} mb-6 lg:mb-0`}
                initial={isDesktop ? { opacity: 1, x: 0 } : { opacity: 0, height: 0 }}
                animate={isDesktop ? { opacity: 1, x: 0 } : { opacity: 1, height: 'auto' }}
                exit={isDesktop ? { opacity: 1, x: 0 } : { opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                      <FiSliders className="w-4 h-4 text-[#6a5acd]" />
                      <h3 className="font-medium text-lg">Filters</h3>
                    </div>
                    
                    {(selectedCategories.length > 0 || effectiveRange[0] > 0 || effectiveRange[1] < maxPrice) && (
                      <button 
                        onClick={clearFilters}
                        className="text-sm text-[#6a5acd] hover:text-[#5d4ebd] transition-colors fill-button"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  
                  {/* Price range slider */}
                  <div className="mb-8">
                    <h3 className="font-medium mb-4">Price Range</h3>
                    
                    <div className="mb-6 relative h-1 rounded-md bg-gray-200" ref={rangeRef}>
                      <div 
                        ref={trackRef}
                        className="absolute h-full bg-[#6a5acd] rounded-md"
                      />
                </div>
                
                    <div className="relative mt-2">
                      <input
                        type="range"
                        min={0}
                        max={maxPrice}
                        ref={minPriceRef}
                        value={effectiveRange[0]}
                        onChange={(e) => handlePriceChange(0, parseInt(e.target.value, 10))}
                        className="absolute w-full -top-3 h-1 bg-transparent appearance-none pointer-events-none 
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto 
                          [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#6a5acd]
                          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                          [&::-webkit-slider-thumb]:mt-0 [&::-webkit-slider-thumb]:shadow-md
                          [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:pointer-events-auto
                          [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
                          [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#6a5acd]
                          [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white
                          [&::-moz-range-thumb]:mt-0 [&::-moz-range-thumb]:shadow-md"
                      />
                            <input 
                        type="range"
                        min={0}
                        max={maxPrice}
                        ref={maxPriceRef}
                        value={effectiveRange[1]}
                        onChange={(e) => handlePriceChange(1, parseInt(e.target.value, 10))}
                        className="absolute w-full -top-3 h-1 bg-transparent appearance-none pointer-events-none 
                          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto 
                          [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
                          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#6a5acd]
                          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white
                          [&::-webkit-slider-thumb]:mt-0 [&::-webkit-slider-thumb]:shadow-md
                          [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:pointer-events-auto
                          [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5
                          [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#6a5acd]
                          [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white
                          [&::-moz-range-thumb]:mt-0 [&::-moz-range-thumb]:shadow-md"
                      />
                    </div>
                    
                    <div className="flex justify-between mt-6">
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                            <input 
                          type="number" 
                          min={0}
                          max={effectiveRange[1]}
                          value={effectiveRange[0]}
                          onChange={(e) => handlePriceChange(0, parseInt(e.target.value, 10) || 0)}
                          className="w-24 pl-8 pr-2 py-2 border rounded-lg focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent focus:outline-none"
                        />
                      </div>
                      <span className="text-gray-500 self-center">to</span>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                            <input 
                          type="number" 
                          min={effectiveRange[0]}
                          max={maxPrice}
                          value={effectiveRange[1]}
                          onChange={(e) => handlePriceChange(1, parseInt(e.target.value, 10) || 0)}
                          className="w-24 pl-8 pr-2 py-2 border rounded-lg focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent focus:outline-none"
                        />
                      </div>
                    </div>
                </div>
                
                  {/* Category filter */}
                  <div>
                    <h3 className="font-medium mb-4">Categories</h3>
                    <div className="flex flex-col gap-2">
                      {categories.map(category => (
                        <div key={category} className="flex items-center">
                                    <input 
                                        type="checkbox" 
                            id={`category-${category}`}
                            checked={selectedCategories.includes(category)}
                            onChange={() => toggleCategory(category)}
                            className="w-4 h-4 text-[#6a5acd] rounded border-gray-300 focus:ring-[#6a5acd]"
                          />
                          <label
                            htmlFor={`category-${category}`}
                            className="ml-2 text-sm font-medium text-gray-700 capitalize"
                          >
                            {category}
                          </label>
                        </div>
                      ))}
                    </div>
            </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          
          {/* Products grid or list */}
          <div className="flex-1">
            {isLoading ? (
              <div className="flex justify-center items-center h-64" role="status" aria-live="polite">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6a5acd]"></div>
                <span className="sr-only">Loading products…</span>
              </div>
            ) : hasFailed ? (
              /* FE-024 — a failed catalog is not an empty one, and saying "no
                 products found" when the request failed is a lie the customer
                 cannot act on. */
              <motion.div
                className="bg-white rounded-xl shadow-md p-10 text-center"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                role="alert"
              >
                <FiShoppingBag className="w-16 h-16 text-[#6a5acd] mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-800 mb-2">We could not load the catalog</h2>
                <p className="text-gray-600 mb-6">{catalogError || 'Please try again in a moment.'}</p>
                <button
                  onClick={reloadCatalog}
                  className="fill-button px-6 py-3 bg-white border border-[#6a5acd] text-[#6a5acd] rounded-lg hover:bg-[#6a5acd] hover:text-white transition-colors"
                >
                  Try again
                </button>
              </motion.div>
            ) : filteredProducts.length === 0 ? (
              <motion.div 
                className="bg-white rounded-xl shadow-md p-10 text-center"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
              >
                <FiShoppingBag className="w-16 h-16 text-[#6a5acd] mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-gray-800 mb-2">No products found</h2>
                <p className="text-gray-600 mb-6">Try adjusting your filters or browse all collections</p>
                                <button 
                  onClick={() => {
                    navigate('/collections/all');
                    clearFilters();
                  }} 
                  className="fill-button px-6 py-3 bg-white border border-[#6a5acd] text-[#6a5acd] rounded-lg hover:bg-[#6a5acd] hover:text-white transition-colors"
                >
                  View All Products
                                </button>
              </motion.div>
            ) : (
              <motion.div 
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className={viewType === 'grid' 
                  ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6" 
                  : "flex flex-col gap-4"
                }
              >
                {filteredProducts.map((product) => (
                  <motion.div 
                    key={product._id} 
                    variants={itemVariants}
                  >
                    {viewType === 'grid' ? (
                      <ProductCard product={product} variant="showcase" />
                    ) : (
                      <div className="flex bg-white rounded-xl shadow-sm overflow-hidden transition-all hover:shadow-md">
                        {/* Product image */}
                        <Link
                          to={`/product/${product._id}`}
                          className="w-40 h-40 flex-shrink-0 overflow-hidden bg-gray-100 block"
                          aria-label={product.name}
                        >
                          {product.image && Array.isArray(product.image) && product.image[0] ? (
                            <img 
                              src={product.image[0]} 
                              alt={product.name || 'Product image'} 
                              className="w-full h-full object-cover hover:scale-105 transition-transform cursor-pointer" 
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FiShoppingBag className="w-10 h-10 text-[#6a5acd]" />
                            </div>
                          )}
                        </Link>

                        {/* Product info */}
                        <div className="p-4 flex-1">
                          <h3 className="text-lg font-medium text-gray-900">
                            <Link to={`/product/${product._id}`} className="hover:text-[#6a5acd]">
                              {product.name || 'Product name'}
                            </Link>
                          </h3>

                          <div className="mt-2">
                            <p className="text-lg font-semibold">{formatPrice(getPriceMinor(product))}</p>
                            {product.brand && <p className="text-sm text-gray-600">{product.brand}</p>}
                          </div>

                          <p className="mt-3 text-sm text-gray-600 line-clamp-2">
                            {product.description || 'No description available.'}
                          </p>
                        </div>
                    </div>
                    )}
                  </motion.div>
                ))}
              </motion.div>
                )}
          </div>
        </div>
      </motion.div>
        </div>
    );
};

export default Collections;