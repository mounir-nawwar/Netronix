import React, { useContext, useEffect, useState } from 'react';
import { ShopContext } from '../context/ShopContext';
import { motion, AnimatePresence } from 'framer-motion';
import { FiHeart, FiChevronLeft, FiShoppingBag, FiTrash2, FiX } from 'react-icons/fi';
import { Link } from 'react-router-dom';

const Wishlist = () => {
  const { wishlist, products, removeFromWishlist, addToCart, navigate, token, currency } = useContext(ShopContext);
  const [wishlistProducts, setWishlistProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }

    // Wait for products to load
    if (products.length > 0) {
      const productDetails = wishlist.map(id => products.find(p => p._id === id)).filter(Boolean);
      setWishlistProducts(productDetails);
      setIsLoading(false);
    }
  }, [wishlist, products, token]);

  const handleRemoveFromWishlist = (productId) => {
    removeFromWishlist(productId);
  };

  const handleAddToCart = (product) => {
    // For products with variants, we need to navigate to the product page
    if (product.variants && product.variants.length > 0) {
      navigate(`/product/${product._id}`);
      return;
    }

    // For products without variants, add with default variant
    const defaultVariant = 'default';
    addToCart(product._id, defaultVariant);
  };

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
      transition: { duration: 0.3 }
    },
    exit: {
      opacity: 0,
      x: -100,
      transition: { duration: 0.3 }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pt-[80px] md:pt-[120px] pb-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <FiChevronLeft className="w-4 h-4" />
            <span>Back</span>
          </button>
          
          <h1 className="text-3xl font-bold text-gray-900">My Wishlist</h1>
          <p className="mt-2 text-gray-600">
            {wishlistProducts.length} {wishlistProducts.length === 1 ? 'item' : 'items'} saved
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6a5acd]"></div>
          </div>
        ) : wishlistProducts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="mb-4 w-16 h-16 mx-auto bg-gray-100 rounded-full flex items-center justify-center">
              <FiHeart className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Your wishlist is empty</h2>
            <p className="text-gray-600 mb-6">Discover products and save your favorites for later</p>
            <button 
              onClick={() => navigate('/products')}
              className="py-3 px-6 bg-[#6a5acd] text-white rounded-lg inline-flex items-center justify-center gap-2 hover:bg-[#5a4cbb] transition-colors fill-button"
            >
              <FiShoppingBag className="w-5 h-5" />
              <span>Explore Products</span>
            </button>
          </div>
        ) : (
          <motion.div 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <AnimatePresence>
              {wishlistProducts.map(product => (
                <motion.div 
                  key={product._id}
                  className="bg-white rounded-xl shadow-sm overflow-hidden"
                  variants={itemVariants}
                  layout
                >
                  <div className="relative">
                    <Link to={`/product/${product._id}`}>
                      <img 
                        src={Array.isArray(product.image) ? product.image[0] : product.image} 
                        alt={product.name}
                        className="w-full h-48 object-cover hover:scale-105 transition-transform"
                      />
                    </Link>
                    <button 
                      onClick={() => handleRemoveFromWishlist(product._id)}
                      className="absolute top-2 right-2 p-2 rounded-full bg-white shadow-md text-gray-700 hover:text-red-500 transition-colors"
                      aria-label="Remove from wishlist"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="p-5">
                    <h3 className="font-michroma text-lg mb-2 text-gray-900">
                      <Link to={`/product/${product._id}`} className="hover:text-[#6a5acd] transition-colors">
                        {product.name}
                      </Link>
                    </h3>
                    
                    <p className="text-[#6a5acd] font-medium mb-4">{currency}{product.price}</p>
                    
                    {/* Actions */}
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleAddToCart(product)}
                        className="flex-1 py-2 px-3 bg-[#6a5acd] text-white rounded-lg flex items-center justify-center gap-1 hover:bg-[#5a4cbb] transition-colors text-sm fill-button"
                      >
                        <FiShoppingBag className="w-4 h-4" />
                        <span>{product.variants?.length > 0 ? 'View Options' : 'Add to Cart'}</span>
                      </button>
                      
                      <button 
                        onClick={() => handleRemoveFromWishlist(product._id)}
                        className="p-2 border border-gray-300 rounded-lg text-gray-600 hover:border-red-500 hover:text-red-500 transition-colors"
                        aria-label="Remove from wishlist"
                      >
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Wishlist; 