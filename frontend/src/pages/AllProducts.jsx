import React, { useContext, useEffect, useState } from 'react';
import { ShopContext } from '../context/ShopContext';
import axios from 'axios';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { FiFilter, FiX, FiChevronDown, FiShoppingBag, FiEye, FiHeart } from 'react-icons/fi';
import { motion } from 'framer-motion';

const AllProducts = () => {
  const { backendUrl, addToCart } = useContext(ShopContext);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortOption, setSortOption] = useState('latest');
  const [searchParams] = useSearchParams();
  const tagFromUrl = searchParams.get('tag');
  
  const [filters, setFilters] = useState({
    categories: {
      options: [],
      selected: []
    },
    variants: {},
    priceRange: [0, 1000]
  });
  
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [hoverProductId, setHoverProductId] = useState(null);

  // Apply URL tag filter if present
  useEffect(() => {
    if (tagFromUrl) {
      // Set the filter once categories are loaded
      if (filters.categories.options.length > 0) {
        setFilters(prev => ({
          ...prev,
          categories: {
            ...prev.categories,
            selected: [tagFromUrl]
          }
        }));
      }
    } else {
      // Clear selected categories if no tag in URL
      if (filters.categories.selected.length > 0) {
        setFilters(prev => ({
          ...prev,
          categories: {
            ...prev.categories,
            selected: []
          }
        }));
      }
    }
  }, [tagFromUrl, filters.categories.options]);

  // Effect to fetch products and categories
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch products
        const productsResponse = await axios.get(`${backendUrl}/api/product/list`);
        
        if (productsResponse.data.success) {
          const productData = productsResponse.data.products;
          setProducts(productData);
          
          // Extract categories and variants from products
          const categories = new Set();
          const variantTypes = {};
          
          // Collect all tags from products
          productData.forEach(product => {
            if (product.tags && Array.isArray(product.tags)) {
              product.tags.forEach(tag => categories.add(tag));
            }
            
            // Extract variant types and options
            if (product.variants && Array.isArray(product.variants)) {
              product.variants.forEach(variant => {
                const variantName = variant.name;
                
                if (!variantTypes[variantName]) {
                  variantTypes[variantName] = new Set();
                }
                
                if (variant.options && Array.isArray(variant.options)) {
                  variant.options.forEach(option => {
                    variantTypes[variantName].add(option);
                  });
                }
              });
            }
          });
          
          // Also try to fetch categories from dedicated endpoint
          try {
            const categoriesResponse = await axios.get(`${backendUrl}/api/product/tags`);
            if (categoriesResponse.data.success && Array.isArray(categoriesResponse.data.tags)) {
              categoriesResponse.data.tags.forEach(tag => categories.add(tag));
            }
          } catch (error) {
            console.error('Error fetching categories:', error);
          }
          
          // Process variant filters
          const processedVariants = {};
          Object.keys(variantTypes).forEach(variantName => {
            processedVariants[variantName] = {
              options: Array.from(variantTypes[variantName]).sort(),
              selected: []
            };
          });
          
          // Set the complete filter state
          setFilters({
            categories: {
              options: Array.from(categories).sort(),
              selected: []
            },
            variants: processedVariants,
            priceRange: [0, 1000]
          });
          
          // Auto-load the computer categories
          addMissingCategories();
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, [backendUrl]);

  // Function to add computer store categories
  const addMissingCategories = () => {
    const additionalCategories = [
      // Main Product Categories
      'Laptops', 'Desktops', 'Monitors', 'Components', 'Peripherals',
      // Specific Product Categories
      'MacBooks', 'Gaming PCs', 'Headphones', 'Earphones', 'Speakers',
      // Components
      'CPU', 'GPU', 'Motherboard', 'RAM', 'Storage', 'PSU', 'Cooling',
      // Peripherals
      'Keyboard', 'Mouse', 'Headset', 'Webcam', 'Speaker', 
      // Networking
      'Networking', 'Router', 'Switch', 'Adapter', 
      // Accessories
      'Accessories', 'Cable', 'Charger', 'Case', 
      // General categories
      'Gaming', 'Office', 'Home', 'Student', 'Professional',
      // Marketing categories
      'New Arrivals', 'Best Sellers', 'Clearance', 'Featured',
      // Legacy categories
      'Electronics'
    ];
    
    setFilters(prevFilters => {
      const updatedOptions = [...prevFilters.categories.options];
      
      additionalCategories.forEach(category => {
        if (!updatedOptions.includes(category)) {
          updatedOptions.push(category);
        }
      });
      
      return {
        ...prevFilters,
        categories: {
          ...prevFilters.categories,
          options: updatedOptions.sort()
        }
      };
    });
  };

  // Toggle category filter
  const toggleCategory = (category) => {
    setFilters(prevFilters => {
      const isSelected = prevFilters.categories.selected.includes(category);
      
      return {
        ...prevFilters,
        categories: {
          ...prevFilters.categories,
          selected: isSelected
            ? prevFilters.categories.selected.filter(c => c !== category)
            : [...prevFilters.categories.selected, category]
        }
      };
    });
  };

  // Toggle variant filter
  const toggleVariantFilter = (variantName, option) => {
    setFilters(prevFilters => {
      const isSelected = prevFilters.variants[variantName].selected.includes(option);
      
      return {
        ...prevFilters,
        variants: {
          ...prevFilters.variants,
          [variantName]: {
            ...prevFilters.variants[variantName],
            selected: isSelected
              ? prevFilters.variants[variantName].selected.filter(o => o !== option)
              : [...prevFilters.variants[variantName].selected, option]
          }
        }
      };
    });
  };
  
  // Handle price range change
  const handlePriceChange = (value, index) => {
    setFilters(prevFilters => {
      const newRange = [...prevFilters.priceRange];
      newRange[index] = value;
      
      // Make sure min never exceeds max
      if (index === 0 && value > newRange[1]) {
        newRange[0] = newRange[1]; 
      }
      
      // Make sure max never falls below min
      if (index === 1 && value < newRange[0]) {
        newRange[1] = newRange[0];
      }
      
      return {
        ...prevFilters,
        priceRange: newRange
      };
    });
  };

  // Clear all filters
  const clearFilters = () => {
    setFilters(prevFilters => {
      const resetVariants = {};
      
      // Reset all variant selections
      Object.keys(prevFilters.variants).forEach(variantName => {
        resetVariants[variantName] = {
          ...prevFilters.variants[variantName],
          selected: []
        };
      });
      
      return {
        categories: {
          ...prevFilters.categories,
          selected: []
        },
        variants: resetVariants,
        priceRange: [0, 1000]
      };
    });
    
    setSortOption('latest');
  };

  // Check if a product matches all selected filters
  const productMatchesFilters = (product) => {
    // Price filter
    if (product.price < filters.priceRange[0] || product.price > filters.priceRange[1]) {
      return false;
    }
    
    // Category filters (tags)
    if (filters.categories.selected.length > 0) {
      // Only show products that have ALL the selected tags
      if (!product.tags || !Array.isArray(product.tags)) {
        return false; // Product has no tags
      }
      
      // Check if product has all selected tags
      const hasAllSelectedTags = filters.categories.selected.every(selectedTag => 
        product.tags.includes(selectedTag)
      );
      
      if (!hasAllSelectedTags) return false;
    }
    
    // Check variant filters
    for (const variantName in filters.variants) {
      const selectedOptions = filters.variants[variantName].selected;
      
      // Skip if no options are selected for this variant type
      if (selectedOptions.length === 0) continue;
      
      // Find if product has this variant type
      const productVariant = product.variants?.find(v => v.name === variantName);
      
      // If product doesn't have this variant or doesn't have matching options, exclude it
      if (!productVariant) return false;
      
      const hasMatchingOption = productVariant.options?.some(option => 
        selectedOptions.includes(option)
      );
      
      if (!hasMatchingOption) return false;
    }
    
    return true;
  };

  // Apply filters and get filtered products
  const filteredProducts = products.filter(productMatchesFilters);

  // Sort filtered products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortOption) {
      case 'price-low':
        return a.price - b.price;
      case 'price-high':
        return b.price - a.price;
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'latest':
      default:
        // Use createdAt or date, fallback to current date if neither exists
        const dateA = a.createdAt || a.date || new Date();
        const dateB = b.createdAt || b.date || new Date();
        return new Date(dateB) - new Date(dateA);
    }
  });

  // Count active filters
  const getActiveFilterCount = () => {
    let count = filters.categories.selected.length;
    
    // Add count of selected variant options
    Object.values(filters.variants).forEach(variant => {
      count += variant.selected.length;
    });
    
    // Add price filter if it's not at default values
    if (filters.priceRange[0] > 0 || filters.priceRange[1] < 1000) {
      count += 1;
    }
    
    return count;
  };
  
  const activeFilterCount = getActiveFilterCount();

  // Handle quick add to cart
  const handleQuickAdd = (e, product) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!product || !product._id) return;
    
    // Get the default variant key or first available variant
    const defaultVariantKey = product.variants && product.variants.length > 0 
      ? product.variants.map(v => v.options[0]).join('-')
      : 'default';
      
    addToCart(product._id, defaultVariantKey, 1);
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-[120px] pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Products</h1>
          <p className="mt-2 text-sm text-gray-500">
            {sortedProducts.length} {sortedProducts.length === 1 ? 'product' : 'products'} available
          </p>
        </div>

        {/* Mobile Controls */}
        <div className="lg:hidden mb-6 flex items-center justify-between">
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="flex items-center px-4 py-2 bg-white rounded-md shadow-sm border border-gray-200 text-sm font-medium text-gray-700"
          >
            <FiFilter className="mr-2 h-4 w-4" />
            Filters {activeFilterCount > 0 && <span className="ml-1 bg-indigo-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs">{activeFilterCount}</span>}
          </button>
          
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="px-4 py-2 bg-white rounded-md shadow-sm border border-gray-200 text-sm text-gray-700"
          >
            <option value="latest">Latest</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="name-asc">Name: A to Z</option>
            <option value="name-desc">Name: Z to A</option>
          </select>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Sidebar */}
          <div 
            className={`w-full lg:w-64 lg:flex-shrink-0 bg-white rounded-lg shadow-sm overflow-hidden transform lg:transform-none lg:opacity-100 transition-all duration-300 ${
              showMobileFilters ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 lg:opacity-100 lg:translate-y-0 h-0 lg:h-auto'
            }`}
          >
            <div className={`${showMobileFilters ? 'block' : 'hidden lg:block'}`}>
              {/* Filters Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Filters</h2>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-indigo-100 hover:text-white underline"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <div className="mt-2 text-xs text-indigo-100">
                    {activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              <div className="p-4 divide-y divide-gray-200">
                {/* Price Range Filter */}
                <div className="py-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Price Range</h3>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="w-24">
                      <label className="text-xs text-gray-500 mb-1 block">Min ($)</label>
                      <input 
                        type="number" 
                        min="0" 
                        max={filters.priceRange[1]}
                        value={filters.priceRange[0]} 
                        onChange={(e) => handlePriceChange(parseInt(e.target.value) || 0, 0)}
                        className="w-full py-1 px-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <span className="text-gray-500">-</span>
                    <div className="w-24">
                      <label className="text-xs text-gray-500 mb-1 block">Max ($)</label>
                      <input 
                        type="number" 
                        min={filters.priceRange[0]} 
                        max="9999"
                        value={filters.priceRange[1]} 
                        onChange={(e) => handlePriceChange(parseInt(e.target.value) || 0, 1)}
                        className="w-full py-1 px-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-4 relative h-2 bg-gray-200 rounded-full">
                    <div 
                      className="absolute h-full bg-indigo-600 rounded-full"
                      style={{ 
                        left: `${(filters.priceRange[0] / 1000) * 100}%`, 
                        width: `${((filters.priceRange[1] - filters.priceRange[0]) / 1000) * 100}%` 
                      }}
                    ></div>
                  </div>
                </div>

                {/* Category Filters */}
                <div className="py-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Categories</h3>
                  <div className="max-h-60 overflow-y-auto space-y-2 scrollbar-thin">
                    {filters.categories.options.map(category => (
                      <div key={category} className="flex items-center">
                        <input
                          id={`category-${category}`}
                          type="checkbox"
                          checked={filters.categories.selected.includes(category)}
                          onChange={() => toggleCategory(category)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`category-${category}`} className="ml-2 text-sm text-gray-700 capitalize">
                          {category}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Variant Filters */}
                {Object.entries(filters.variants).map(([variantName, variantData]) => (
                  <div key={variantName} className="py-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3 capitalize">{variantName}</h3>
                    <div className="space-y-2">
                      {variantData.options.map(option => (
                        <div key={option} className="flex items-center">
                          <input
                            id={`variant-${variantName}-${option}`}
                            type="checkbox"
                            checked={variantData.selected.includes(option)}
                            onChange={() => toggleVariantFilter(variantName, option)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label htmlFor={`variant-${variantName}-${option}`} className="ml-2 text-sm text-gray-700">
                            {option}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1">
            {/* Desktop controls */}
            <div className="hidden lg:flex items-center justify-between mb-6">
              <div>
                <span className="text-sm text-gray-500">
                  {sortedProducts.length} {sortedProducts.length === 1 ? 'product' : 'products'} found
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Sort by:</span>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="py-2 px-3 bg-white border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="latest">Latest</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="name-desc">Name: Z to A</option>
                </select>
              </div>
            </div>
            
            {/* Active Filters Display */}
            {activeFilterCount > 0 && (
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-500">Active filters:</span>
                
                {/* Price filter tag */}
                {(filters.priceRange[0] > 0 || filters.priceRange[1] < 1000) && (
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                    Price: ${filters.priceRange[0]} - ${filters.priceRange[1]}
                    <button
                      type="button"
                      onClick={() => setFilters(prev => ({...prev, priceRange: [0, 1000]}))}
                      className="ml-1 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500 focus:outline-none"
                    >
                      <FiX className="h-3 w-3" />
                    </button>
                  </span>
                )}
                
                {/* Category filters */}
                {filters.categories.selected.map(category => (
                  <span 
                    key={category}
                    className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                  >
                    {category}
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="ml-1 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500 focus:outline-none"
                    >
                      <FiX className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                
                {/* Variant filters */}
                {Object.entries(filters.variants).map(([variantName, variantData]) =>
                  variantData.selected.map(option => (
                    <span 
                      key={`${variantName}-${option}`}
                      className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                    >
                      {variantName}: {option}
                      <button
                        type="button"
                        onClick={() => toggleVariantFilter(variantName, option)}
                        className="ml-1 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500 focus:outline-none"
                      >
                        <FiX className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            )}
            
            {/* Loading state */}
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
              </div>
            ) : sortedProducts.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <FiShoppingBag className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No products found</h3>
                <p className="mt-2 text-sm text-gray-500">Try changing your filters or search criteria</p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                {sortedProducts.map((product) => (
                  <motion.div
                    key={product._id}
                    whileHover={{ y: -5 }}
                    transition={{ duration: 0.2 }}
                    onMouseEnter={() => setHoverProductId(product._id)}
                    onMouseLeave={() => setHoverProductId(null)}
                  >
                    <Link 
                      to={`/product/${product._id}`} 
                      className="group block h-full"
                    >
                      <div className="relative overflow-hidden rounded-lg bg-white shadow-sm h-full flex flex-col">
                        {/* Product Image */}
                        <div className="aspect-h-1 aspect-w-1 relative overflow-hidden bg-gradient-to-b from-gray-50 to-gray-100">
                          <img
                            src={product.image && product.image.length > 0 ? product.image[0] : ''}
                            alt={product.name}
                            className="h-[250px] w-full object-contain object-center transition-all duration-300 group-hover:scale-105"
                          />
                          
                          {/* Hover overlay with action buttons */}
                          <div 
                            className={`absolute inset-0 bg-black bg-opacity-20 transition-opacity duration-300 flex items-center justify-center gap-2 ${
                              hoverProductId === product._id ? 'opacity-100' : 'opacity-0'
                            }`}
                          >
                            <button 
                              onClick={(e) => handleQuickAdd(e, product)}
                              className="p-2 bg-white rounded-full shadow-md hover:bg-indigo-500 hover:text-white transition-colors"
                              aria-label="Add to cart"
                            >
                              <FiShoppingBag className="h-5 w-5" />
                            </button>
                            <button 
                              className="p-2 bg-white rounded-full shadow-md hover:bg-indigo-500 hover:text-white transition-colors"
                              aria-label="Quick view"
                            >
                              <FiEye className="h-5 w-5" />
                            </button>
                            <button 
                              className="p-2 bg-white rounded-full shadow-md hover:bg-indigo-500 hover:text-white transition-colors"
                              aria-label="Add to wishlist"
                            >
                              <FiHeart className="h-5 w-5" />
                            </button>
                          </div>
                          
                          {/* Tags */}
                          {product.tags && product.tags.length > 0 && (
                            <div className="absolute top-2 left-2 flex flex-wrap gap-1">
                              {product.tags.slice(0, 2).map((tag, index) => (
                                <span 
                                  key={index} 
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
                        
                        {/* Product info */}
                        <div className="flex flex-col flex-1 p-4">
                          <div className="flex-1">
                            {product.brand && (
                              <p className="text-sm text-indigo-600 mb-1">{product.brand}</p>
                            )}
                            <h3 className="text-base font-medium text-gray-900 line-clamp-2 group-hover:text-indigo-600 transition-colors">
                              {product.name}
                            </h3>
                            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
                              {product.description}
                            </p>
                          </div>
                          
                          <div className="mt-3 flex items-center justify-between">
                            <p className="text-lg font-semibold text-gray-900">${product.price}</p>
                            <div className="text-sm text-amber-500 flex items-center">
                              ★★★★★
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AllProducts; 