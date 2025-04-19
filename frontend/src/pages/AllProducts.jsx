import React, { useContext, useEffect, useState } from 'react';
import { ShopContext } from '../context/ShopContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { FiFilter, FiX, FiChevronDown } from 'react-icons/fi';

const AllProducts = () => {
  const { backendUrl } = useContext(ShopContext);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);
  const [sortOption, setSortOption] = useState('latest');
  const [debugInfo, setDebugInfo] = useState({ productsLoaded: false, categoriesFound: [] });
  
  // Completely reworked filtering system
  const [filters, setFilters] = useState({
    categories: {
      options: [],
      selected: []
    },
    variants: {}
  });
  
  const [showMobileFilters, setShowMobileFilters] = useState(false);

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
          const debugCategories = [];
          
          console.log("Products data:", productData);
          
          productData.forEach(product => {
            // Extract categories (tags)
            if (product.tags && Array.isArray(product.tags)) {
              console.log(`Product ${product.name} has tags:`, product.tags);
              
              product.tags.forEach(tag => {
                if (tag !== "All") {
                  categories.add(tag);
                  if (!debugCategories.includes(tag)) {
                    debugCategories.push(tag);
                  }
                }
              });
            } else {
              console.log(`Product ${product.name} has no tags or tags is not an array`);
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
          
          setDebugInfo(prev => ({
            ...prev,
            productsLoaded: true,
            categoriesFound: debugCategories
          }));
          
          // Also try to fetch categories from dedicated endpoint
          try {
            const categoriesResponse = await axios.get(`${backendUrl}/api/product/tags`);
            console.log("Categories API response:", categoriesResponse.data);
            
            if (categoriesResponse.data.success && Array.isArray(categoriesResponse.data.tags)) {
              categoriesResponse.data.tags.forEach(tag => {
                if (tag !== "All") {
                  categories.add(tag);
                  if (!debugCategories.includes(tag)) {
                    debugCategories.push(tag);
                  }
                }
              });
            }
            
            setDebugInfo(prev => ({
              ...prev,
              apiCategories: categoriesResponse.data.tags || [],
              finalCategories: Array.from(categories)
            }));
            
          } catch (error) {
            console.error('Error fetching categories:', error);
            setDebugInfo(prev => ({
              ...prev,
              categoriesError: error.message
            }));
            // Continue execution - we already extracted categories from products
          }
          
          // Process and set all filters
          const processedVariants = {};
          
          // Process variant filters
          Object.keys(variantTypes).forEach(variantName => {
            processedVariants[variantName] = {
              options: Array.from(variantTypes[variantName]).sort(),
              selected: []
            };
          });
          
          const categoriesArray = Array.from(categories).sort();
          console.log("Final categories array:", categoriesArray);
          
          // Set the complete filter state
          setFilters({
            categories: {
              options: categoriesArray,
              selected: []
            },
            variants: processedVariants
          });
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching data:', error);
        setDebugInfo(prev => ({
          ...prev,
          fetchError: error.message
        }));
        setLoading(false);
      }
    };

    fetchData();
    
    // Show navbar after a delay for animation
    setTimeout(() => {
      setVisible(true);
    }, 100);
  }, [backendUrl]);

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
        variants: resetVariants
      };
    });
    
    setSortOption('latest');
  };

  // Check if a product matches all selected filters
  const productMatchesFilters = (product) => {
    // Check category filters
    const categoryMatches = filters.categories.selected.length === 0 || 
      product.tags?.some(tag => filters.categories.selected.includes(tag));
    
    if (!categoryMatches) return false;
    
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
    
    return count;
  };
  
  const activeFilterCount = getActiveFilterCount();

  // Check if we need to manually add categories
  const addMissingCategories = () => {
    const additionalCategories = ["electronics", "women", "kids"];
    
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

  return (
    <div className="min-h-screen">
      <Navbar visible={visible} />

      <div className="container mx-auto px-4 py-16 mt-24">
        <h1 className="font-['Michroma'] text-3xl md:text-4xl text-center mb-8">All Products</h1>
        
        {/* Debug section */}
        <div className="mb-4 p-4 bg-gray-100 rounded-lg">
          <h3 className="font-bold mb-2">Debug Information:</h3>
          <p>Products loaded: {debugInfo.productsLoaded ? 'Yes' : 'No'}</p>
          <p>Categories found in products: {debugInfo.categoriesFound.join(', ') || 'None'}</p>
          {debugInfo.apiCategories && (
            <p>Categories from API: {debugInfo.apiCategories.join(', ') || 'None'}</p>
          )}
          {debugInfo.finalCategories && (
            <p>Final categories: {debugInfo.finalCategories.join(', ') || 'None'}</p>
          )}
          {debugInfo.categoriesError && (
            <p className="text-red-500">Categories API Error: {debugInfo.categoriesError}</p>
          )}
          {debugInfo.fetchError && (
            <p className="text-red-500">Fetch Error: {debugInfo.fetchError}</p>
          )}
          <button 
            onClick={addMissingCategories}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
          >
            Manually Add Missing Categories
          </button>
        </div>

        {/* Mobile filter button */}
        <div className="md:hidden mb-4">
          <button 
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 rounded-lg"
          >
            <div className="flex items-center gap-2">
              <FiFilter className="w-4 h-4" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="bg-[#6a5acd] text-white text-xs rounded-full px-2 py-0.5">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <FiChevronDown className={`transform transition-transform ${showMobileFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Filters column */}
          <div className={`lg:w-1/4 space-y-6 ${showMobileFilters ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-michroma text-lg">Filters</h3>
                {activeFilterCount > 0 && (
                  <button 
                    onClick={clearFilters}
                    className="text-sm text-[#6a5acd] hover:text-[#5a4cbb] underline"
                  >
                    Clear All
                  </button>
                )}
              </div>
              
              {/* Category filters */}
              <div className="mb-6">
                <h4 className="font-michroma text-sm mb-3">Categories ({filters.categories.options.length})</h4>
                <div className="flex flex-wrap gap-2">
                  {filters.categories.options.map(category => (
                    <button
                      key={category}
                      onClick={() => toggleCategory(category)}
                      className={`px-3 py-1 text-xs rounded-full ${
                        filters.categories.selected.includes(category)
                          ? 'bg-[#6a5acd] text-white'
                          : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Variant filters */}
              {Object.entries(filters.variants).map(([variantName, variantData]) => (
                <div key={variantName} className="mb-6">
                  <h4 className="font-michroma text-sm mb-3">{variantName}</h4>
                  <div className="flex flex-wrap gap-2">
                    {variantData.options.map(option => (
                      <button
                        key={option}
                        onClick={() => toggleVariantFilter(variantName, option)}
                        className={`px-3 py-1 text-xs rounded-full ${
                          variantData.selected.includes(option)
                            ? 'bg-[#6a5acd] text-white'
                            : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                        }`}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              
              {/* Sort on mobile */}
              <div className="lg:hidden">
                <h4 className="font-michroma text-sm mb-3">Sort By</h4>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#6a5acd]"
                >
                  <option value="latest">Latest</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="name-desc">Name: Z to A</option>
                </select>
              </div>
            </div>
          </div>

          {/* Products column */}
          <div className="lg:w-3/4">
            {/* Desktop sort select */}
            <div className="hidden lg:flex justify-between items-center mb-6">
              <p className="text-gray-500 text-sm">
                {sortedProducts.length} {sortedProducts.length === 1 ? 'product' : 'products'} found
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">Sort by:</span>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#6a5acd]"
                >
                  <option value="latest">Latest</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="name-desc">Name: Z to A</option>
                </select>
              </div>
            </div>

            {/* Active filters display */}
            {activeFilterCount > 0 && (
              <div className="mb-4 flex flex-wrap gap-2 items-center">
                <span className="text-sm text-gray-600">Active filters:</span>
                
                {/* Category filters */}
                {filters.categories.selected.map(category => (
                  <span 
                    key={category} 
                    className="flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-xs"
                  >
                    {category}
                    <button 
                      onClick={() => toggleCategory(category)}
                      className="ml-1 text-gray-500 hover:text-gray-700"
                    >
                      <FiX size={14} />
                    </button>
                  </span>
                ))}
                
                {/* Variant filters */}
                {Object.entries(filters.variants).map(([variantName, variantData]) =>
                  variantData.selected.map(option => (
                    <span 
                      key={`${variantName}-${option}`} 
                      className="flex items-center gap-1 px-3 py-1 bg-gray-100 rounded-full text-xs"
                    >
                      {variantName}: {option}
                      <button 
                        onClick={() => toggleVariantFilter(variantName, option)}
                        className="ml-1 text-gray-500 hover:text-gray-700"
                      >
                        <FiX size={14} />
                      </button>
                    </span>
                  ))
                )}
                
                <button 
                  onClick={clearFilters}
                  className="text-xs text-[#6a5acd] hover:text-[#5a4cbb] underline"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Products Grid */}
            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#6a5acd]"></div>
              </div>
            ) : sortedProducts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 md:gap-6">
                {sortedProducts.map((product) => (
                  <Link key={product._id} to={`/product/${product._id}`} className="block group">
                    <div className="bg-gray-50 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                      <div className="aspect-square overflow-hidden">
                        <img 
                          src={product.image && product.image.length > 0 ? product.image[0] : ''} 
                          alt={product.name} 
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                      </div>
                      <div className="p-2 md:p-4">
                        <h3 className="text-sm md:text-lg font-semibold truncate">{product.name}</h3>
                        {product.brand && (
                          <p className="text-xs md:text-sm text-gray-500">{product.brand}</p>
                        )}
                        <div className="flex flex-wrap mt-1 md:mt-2 gap-1">
                          {product.tags && product.tags.length > 0 && (
                            <span className="inline-block px-2 py-0.5 bg-gray-200 text-xs rounded">
                              {product.tags[0]}
                            </span>
                          )}
                          {product.tags && product.tags.length > 1 && (
                            <span className="inline-block px-2 py-0.5 bg-gray-200 text-xs rounded">
                              +{product.tags.length - 1}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 md:mt-2 text-sm md:text-lg font-bold text-[#6a5acd]">${product.price}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-16 bg-white rounded-lg shadow-sm">
                <p className="text-xl text-gray-600">No products found matching your criteria.</p>
                <button 
                  onClick={clearFilters}
                  className="mt-4 px-6 py-2 bg-[#6a5acd] text-white rounded-md hover:bg-[#5a4cbb] transition-colors"
                >
                  Reset Filters
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
};

export default AllProducts; 