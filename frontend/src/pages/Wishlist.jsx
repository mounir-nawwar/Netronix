import { useContext, useEffect, useState } from 'react';
import { ShopContext } from '../context/shopContext';
import { motion, AnimatePresence } from 'framer-motion';
import { FiHeart, FiChevronLeft, FiShoppingBag, FiTrash2, FiX } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import Seo from '../components/Seo';

// FE-013 — the spinner that never stopped.
//
// `setIsLoading(false)` was inside `if (products.length > 0)`, so the only way
// out of the loading state was a catalog with at least one product in it. A
// fresh database, a failed catalog request, or an account with nothing saved all
// produced the same thing: a spinner, for ever, with no error and no empty
// state. The one case the page most needed to handle — "you have not saved
// anything yet" — was the case it could not reach.
//
// It settles on whatever actually happened now: loading, empty, or failed.
const Wishlist = () => {
  const {
    wishlist, wishlistStatus, products, catalogStatus, catalogError, reloadCatalog,
    removeFromWishlist, addToCart, navigate, goBack, formatPrice, getPriceMinor,
  } = useContext(ShopContext);
  const [wishlistProducts, setWishlistProducts] = useState([]);

  // Both requests have to settle before the list means anything: the wishlist
  // supplies the ids and the catalog supplies the products they name.
  const isLoading = wishlistStatus === 'loading' || wishlistStatus === 'idle' || catalogStatus === 'loading';
  const hasFailed = wishlistStatus === 'error' || catalogStatus === 'error';

  useEffect(() => {
    setWishlistProducts(wishlist.map(id => products.find(p => p._id === id)).filter(Boolean));
  }, [wishlist, products]);

  const handleRemoveFromWishlist = (productId) => {
    removeFromWishlist(productId);
  };

  const handleAddToCart = (product) => {
    // For products with variants, we need to navigate to the product page
    if (product.variants && product.variants.length > 0) {
      navigate(`/product/${product._id}`);
      return;
    }

    // A variantless product's one valid identity is the empty option set.
    addToCart(product._id, { variantOptions: {} });
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

        <Seo title="Your Wishlist" description="Products you have saved at Netronix." />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          {/* FE-005 — `navigate(-1)` used to reach `navigateWithContext`, which
              called `.includes()` on the number, threw, and fell back to
              `window.location.href = -1`: a full page load of "/-1" and a blank
              screen. `goBack()` hands the step to the router. */}
          <button
            onClick={goBack}
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
          <div className="flex justify-center items-center h-64" role="status" aria-live="polite">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6a5acd]"></div>
            <span className="sr-only">Loading your saved items…</span>
          </div>
        ) : hasFailed ? (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center" role="alert">
            <div className="mb-4 w-16 h-16 mx-auto bg-amber-50 rounded-full flex items-center justify-center">
              <FiHeart className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">We could not load your saved items</h2>
            <p className="text-gray-600 mb-6">{catalogError || 'Please try again in a moment.'}</p>
            <button
              onClick={reloadCatalog}
              className="py-3 px-6 bg-[#6a5acd] text-white rounded-lg inline-flex items-center justify-center gap-2 hover:bg-[#5a4cbb] transition-colors fill-button"
            >
              Try again
            </button>
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
                    
                    <p className="text-[#6a5acd] font-medium mb-4">{formatPrice(getPriceMinor(product))}</p>
                    
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