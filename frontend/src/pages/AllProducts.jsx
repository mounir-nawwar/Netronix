import React, { useContext, useEffect, useState } from 'react';
import { ShopContext } from '../context/ShopContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import axios from 'axios';
import { Link } from 'react-router-dom';

const AllProducts = () => {
  const { backendUrl } = useContext(ShopContext);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [allTags, setAllTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [visible, setVisible] = useState(false);
  const [sortOption, setSortOption] = useState('latest');

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${backendUrl}/api/product/all-products`);
        if (response.data.success) {
          setProducts(response.data.products);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching products:', error);
        setLoading(false);
      }
    };

    const fetchTags = async () => {
      try {
        const response = await axios.get(`${backendUrl}/api/product/tags`);
        if (response.data.success) {
          // Filter out any "All" tag if it exists
          const filteredTags = response.data.tags.filter(tag => tag !== "All");
          setAllTags(filteredTags);
        }
      } catch (error) {
        console.error('Error fetching tags:', error);
      }
    };

    fetchProducts();
    fetchTags();
    
    // Show navbar after a delay for animation
    setTimeout(() => {
      setVisible(true);
    }, 100);
  }, [backendUrl]);

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const clearFilters = () => {
    setSelectedTags([]);
    setSortOption('latest');
  };

  // Filter products by selected tags
  const filteredProducts = products.filter(product => {
    if (selectedTags.length === 0) return true;
    return product.tags?.some(tag => selectedTags.includes(tag));
  });

  // Sort products based on selected option
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
        return new Date(b.createdAt) - new Date(a.createdAt);
    }
  });

  return (
    <div className="min-h-screen">
      <Navbar visible={visible} />

      <div className="container mx-auto px-4 py-16 mt-24">
        <h1 className="font-['Michroma'] text-3xl md:text-4xl text-center mb-12">All Products</h1>

        {/* Filters and Sort */}
        <div className="flex flex-col md:flex-row justify-between mb-8">
          <div className="mb-6 md:mb-0">
            <h3 className="font-michroma text-lg mb-3">Filter by Tags</h3>
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`px-3 py-1 text-sm rounded-full ${
                    selectedTags.includes(tag)
                      ? 'bg-black text-white'
                      : 'bg-gray-200 text-gray-800 hover:bg-gray-300'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
            {selectedTags.length > 0 && (
              <button 
                onClick={clearFilters}
                className="mt-3 text-sm text-gray-600 underline hover:text-black"
              >
                Clear All Filters
              </button>
            )}
          </div>

          <div>
            <h3 className="font-michroma text-lg mb-3">Sort By</h3>
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black"
            >
              <option value="latest">Latest</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
              <option value="name-asc">Name: A to Z</option>
              <option value="name-desc">Name: Z to A</option>
            </select>
          </div>
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
          </div>
        ) : sortedProducts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {sortedProducts.map((product) => (
              <Link key={product._id} to={`/product/${product._id}`} className="block group">
                <div className="bg-gray-50 rounded-lg overflow-hidden">
                  <div className="h-64 overflow-hidden">
                    <img 
                      src={product.image} 
                      alt={product.name} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="text-lg font-semibold truncate">{product.name}</h3>
                    <div className="flex flex-wrap mt-2 gap-1">
                      {product.tags && product.tags.map((tag, idx) => (
                        <span key={idx} className="inline-block px-2 py-1 bg-gray-200 text-xs rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                    <p className="mt-2 text-lg font-bold">${product.price}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <p className="text-xl text-gray-600">No products found matching your criteria.</p>
            <button 
              onClick={clearFilters}
              className="mt-4 px-6 py-2 bg-black text-white rounded-md hover:bg-gray-800"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
};

export default AllProducts; 