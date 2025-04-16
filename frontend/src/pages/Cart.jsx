import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext';
import { toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import { FiShoppingCart, FiTrash2, FiMinus, FiPlus, FiAlertCircle, FiArrowRight, FiChevronLeft } from 'react-icons/fi';
import CartTotal from '../components/CartTotal';

const Cart = () => {

  const { products, currency, cartItems, updateQuantity, navigate, getVariantDisplayName } = useContext(ShopContext);

  const [cartData, setCartData] = useState([]);
  const [inventoryWarnings, setInventoryWarnings] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    
    if (products.length > 0) {
      const tempData = [];
      const warnings = {};
      
      for (const items in cartItems) {
        for (const variantKey in cartItems[items]) {
          if (cartItems[items][variantKey] > 0) {
            tempData.push({
              _id: items,
              variantKey: variantKey,
              quantity: cartItems[items][variantKey],
            });
            
            // Check inventory for this item
            const product = products.find(p => p._id === items);
            if (product && product.inventory) {
              const availableQuantity = product.inventory[variantKey] || 0;
              const cartQuantity = cartItems[items][variantKey];
              
              // If cart quantity exceeds available inventory, create a warning
              if (cartQuantity > availableQuantity) {
                warnings[`${items}-${variantKey}`] = {
                  available: availableQuantity,
                  requested: cartQuantity
                };
              }
            }
          }
        }
      }
      setCartData(tempData);
      setInventoryWarnings(warnings);
    }
    
    setTimeout(() => setIsLoading(false), 300); // Add a small delay for smoother transitions
  }, [cartItems, products]);

  // Check if a specific item has inventory warning
  const hasInventoryWarning = (productId, variantKey) => {
    return inventoryWarnings[`${productId}-${variantKey}`] !== undefined;
  };

  // Get available inventory for a product and variant
  const getAvailableInventory = (productId, variantKey) => {
    const product = products.find(p => p._id === productId);
    if (!product || !product.inventory) return 0;
    return product.inventory[variantKey] || 0;
  };

  // Handle quantity change with inventory check
  const handleQuantityChange = (productId, variantKey, newQuantity) => {
    const availableInventory = getAvailableInventory(productId, variantKey);
    
    if (newQuantity > availableInventory) {
      toast.error(`Only ${availableInventory} items available for this variant`);
      // Update to maximum available
      updateQuantity(productId, variantKey, availableInventory);
    } else {
      updateQuantity(productId, variantKey, newQuantity);
    }
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
      transition: {
        type: "spring",
        stiffness: 300,
        damping: 24
      }
    },
    exit: {
      opacity: 0,
      x: -20,
      transition: {
        duration: 0.2
      }
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 px-4 sm:px-6 lg:px-8 py-12 pt-[80px] md:pt-[100px]">
      <motion.div 
        className="max-w-5xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center mb-6">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 mr-3 rounded-full hover:bg-gray-100 transition-colors text-[#6a5acd]"
          >
            <FiChevronLeft className="w-5 h-5" />
          </button>
          <motion.h1 
            className="text-3xl font-bold text-gray-900"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            Shopping Cart
          </motion.h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6a5acd]"></div>
          </div>
        ) : cartData.length === 0 ? (
          <motion.div 
            className="bg-white rounded-xl shadow-md p-10 text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <FiShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Your cart is empty</h2>
            <p className="text-gray-600 mb-6">Add items to get started</p>
            <button 
              onClick={() => navigate('/collections/all')} 
              className="px-6 py-3 rounded-lg text-white bg-[#6a5acd] hover:bg-[#5a4cbb] transition-colors fill-button fill-button-hero"
            >
              Start Shopping
            </button>
          </motion.div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Cart Items */}
            <motion.div 
              className="lg:w-2/3"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence>
                {cartData.map((item, index) => {
                  const productData = products.find((product) => product._id === item._id);
                  const hasWarning = hasInventoryWarning(item._id, item.variantKey);
                  const availableInventory = getAvailableInventory(item._id, item.variantKey);
                  const variantDisplay = getVariantDisplayName(productData, item.variantKey);
                  
                  if (!productData) return null;
                  
                  return (
                    <motion.div 
                      key={`${item._id}-${item.variantKey}`}
                      className="bg-white rounded-xl shadow-sm mb-4 overflow-hidden transition-all hover:shadow-md"
                      variants={itemVariants}
                      exit="exit"
                    >
                      <div className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row gap-4">
                          {/* Product Image */}
                          <div className="relative w-full sm:w-24 h-40 sm:h-24 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                            {productData.image && Array.isArray(productData.image) && productData.image[0] ? (
                              <img 
                                className="w-full h-full object-cover" 
                                src={productData.image[0]} 
                                alt={productData.name || 'Product'} 
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center bg-gray-200">
                                <FiShoppingCart className="w-10 h-10 text-gray-400" />
                              </div>
                            )}
                          </div>

                          {/* Product Details */}
                          <div className="flex-grow">
                            <div className="flex justify-between items-start">
                              <h3 className="text-lg font-semibold text-gray-900">{productData.name || 'Product'}</h3>
                              <button 
                                onClick={() => updateQuantity(item._id, item.variantKey, 0)}
                                className="p-1 text-gray-400 hover:text-[#6a5acd] transition-colors"
                                aria-label="Remove item"
                              >
                                <FiTrash2 className="w-5 h-5" />
                              </button>
                            </div>
                            
                            <div className="mt-1 text-sm text-gray-500">
                              Size: {variantDisplay || 'One Size'}
                            </div>
                            
                            <div className="mt-2 text-lg font-medium text-[#6a5acd]">
                              {currency}{productData.price || 0}
                            </div>
                            
                            <div className="mt-4 flex justify-between items-center">
                              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                                <button 
                                  onClick={() => handleQuantityChange(item._id, item.variantKey, Math.max(1, item.quantity - 1))}
                                  className="px-3 py-1 hover:bg-gray-100 transition-colors"
                                  disabled={item.quantity <= 1}
                                >
                                  <FiMinus className={`w-4 h-4 ${item.quantity <= 1 ? 'text-gray-300' : 'text-[#6a5acd]'}`} />
                                </button>
                                <span className="px-3 py-1 min-w-[40px] text-center">{item.quantity}</span>
                                <button 
                                  onClick={() => handleQuantityChange(item._id, item.variantKey, item.quantity + 1)}
                                  className="px-3 py-1 hover:bg-gray-100 transition-colors"
                                  disabled={item.quantity >= availableInventory}
                                >
                                  <FiPlus className={`w-4 h-4 ${item.quantity >= availableInventory ? 'text-gray-300' : 'text-[#6a5acd]'}`} />
                                </button>
                              </div>
                              
                              <div className="text-lg font-semibold text-[#6a5acd]">
                                {currency}{(productData.price * item.quantity).toFixed(2)}
                              </div>
                            </div>
                            
                            {/* Inventory Warning */}
                            {hasWarning && (
                              <motion.div 
                                className="mt-3 p-2 bg-red-50 border border-red-100 rounded-md flex items-start gap-2"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                transition={{ duration: 0.3 }}
                              >
                                <FiAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-red-600">
                                  Only {availableInventory} item(s) in stock. 
                                  Please adjust your quantity.
                                </div>
                              </motion.div>
                            )}
                            
                            {availableInventory === 0 && (
                              <motion.div 
                                className="mt-3 p-2 bg-red-50 border border-red-100 rounded-md flex items-start gap-2"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                transition={{ duration: 0.3 }}
                              >
                                <FiAlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                <div className="text-sm text-red-600">
                                  Out of stock. Please remove this item.
                                </div>
                              </motion.div>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
            
            {/* Cart Summary */}
            <motion.div 
              className="lg:w-1/3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              <div className="bg-white rounded-xl shadow-md p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>
                
                <CartTotal />
                
                <button 
                  onClick={() => {
                    // Check if any items have inventory warnings before proceeding
                    if (Object.keys(inventoryWarnings).length > 0) {
                      toast.error('Please resolve inventory issues before checkout');
                      return;
                    }
                    navigate('/placeorder');
                  }}
                  disabled={Object.keys(inventoryWarnings).length > 0}
                  className={`mt-6 w-full flex justify-center items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-colors 
                    ${Object.keys(inventoryWarnings).length > 0 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-[#6a5acd] hover:bg-[#5a4cbb] fill-button'
                    }`}
                >
                  Proceed to Checkout
                  <FiArrowRight className="w-4 h-4" />
                </button>
                
                {Object.keys(inventoryWarnings).length > 0 && (
                  <p className="mt-3 text-sm text-red-500 text-center">
                    Please resolve inventory issues before checkout
                  </p>
                )}
                
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <button 
                    onClick={() => navigate('/collections/all')}
                    className="w-full text-center text-[#6a5acd] hover:text-[#5a4cbb] transition-colors text-sm underline"
                  >
                    Continue Shopping
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </motion.div>
    </div>
  )
}

export default Cart