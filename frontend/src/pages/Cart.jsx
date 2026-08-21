import { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/shopContext';
import { lineIdOf } from '../lib/cartLines';
import { toast } from '../lib/toast';
import { motion, AnimatePresence } from 'framer-motion';
import { FiShoppingCart, FiTrash2, FiMinus, FiPlus, FiAlertCircle, FiArrowRight } from 'react-icons/fi';
import CartTotal from '../components/CartTotal';
import BackButton from '../components/BackButton';
import Seo from '../components/Seo';

// FE-012 — the cart said "empty" while it was still loading.
//
// It ran `setTimeout(() => setIsLoading(false), 300)` on every effect, whether
// or not the catalog had arrived, and the timeout was never cleared. Three
// hundred milliseconds is not a fact about anything: on a slow connection the
// timer won, `cartData` was still `[]` because the catalog had not landed, and a
// customer with a full cart was told their cart was empty and shown a "Start
// Shopping" button.
//
// Loading is not a timer. It is the state of the request, which the context now
// reports, and this page reads.
const Cart = () => {

  const {
    products, cartLines, catalogStatus, catalogError, reloadCatalog, updateQuantity, navigate,
    getVariantDisplayName, getPriceMinor, formatPrice, getUnpricedCartLines,
  } = useContext(ShopContext);

  const [cartData, setCartData] = useState([]);
  const [inventoryWarnings, setInventoryWarnings] = useState({});

  const isLoading = catalogStatus === 'loading';
  const hasFailed = catalogStatus === 'error';
  // FE-024 — lines the catalog cannot price. Counting them as zero is how a
  // cart quietly under-reports its own total.
  const unpricedLines = getUnpricedCartLines();

  useEffect(() => {
    if (products.length === 0) {
      setCartData([]);
      setInventoryWarnings({});
      return;
    }

    const tempData = [];
    const warnings = {};

    // One row per line the customer actually chose (DB-003). Iterating the
    // legacy `{ productId: { key: quantity } }` map collapsed two combinations
    // whose option values hyphen-join to the same string into one row, so the
    // cart could not show — or remove — the one that was overwritten.
    for (const line of cartLines) {
      if (line.quantity <= 0) continue;

      const id = lineIdOf(line);
      tempData.push({
        id,
        _id: String(line.productId),
        variantKey: line.variantKey,
        variantId: line.variantId,
        variantOptions: line.variantOptions,
        variantLabel: line.variantLabel,
        quantity: line.quantity,
        unresolvable: line.unresolvable,
        available: line.available,
      });

      // `null` is not zero. A line the catalog cannot identify — an ambiguous
      // hyphen join, or an option that was withdrawn — is a different problem
      // from "none left", and telling the customer "out of stock" about a
      // product that is in stock is both untrue and unactionable: re-adding the
      // same option reproduces it.
      if (line.unresolvable) {
        warnings[id] = { available: 0, requested: line.quantity, unidentifiable: true };
      } else if (line.quantity > (line.available ?? 0)) {
        warnings[id] = { available: line.available ?? 0, requested: line.quantity };
      }
    }

    setCartData(tempData);
    setInventoryWarnings(warnings);
  }, [cartLines, products]);

  // Check if a specific line has an inventory warning
  const hasInventoryWarning = (id) => inventoryWarnings[id] !== undefined;

  /** True when the catalog cannot say which combination this line names. */
  const isUnidentifiable = (id) => Boolean(inventoryWarnings[id]?.unidentifiable);

  /**
   * How to address one line.
   *
   * The canonical identity where the line has one, because two lines can share
   * a legacy key and addressing by key would then change whichever came first.
   */
  const lineRefOf = (item) => (item.variantId
    ? { variantId: item.variantId }
    : { variantKey: item.variantKey });

  // Handle quantity change with inventory check
  const handleQuantityChange = (item, newQuantity) => {
    const availableInventory = item.available ?? 0;

    if (newQuantity > availableInventory) {
      toast.error(`Only ${availableInventory} items available for this variant`);
      // Update to maximum available
      updateQuantity(item._id, lineRefOf(item), availableInventory);
    } else {
      updateQuantity(item._id, lineRefOf(item), newQuantity);
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

        <Seo title="Your Cart" description="Review the items in your Netronix cart before checkout." />
      <motion.div 
        className="max-w-5xl mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="flex items-center mb-6">
          <BackButton showLabel={false} className="mr-3" />
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
          <div className="flex justify-center items-center h-64" role="status" aria-live="polite">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6a5acd]"></div>
            <span className="sr-only">Loading your cart…</span>
          </div>
        ) : hasFailed ? (
          <motion.div
            className="bg-white rounded-xl shadow-md p-10 text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            role="alert"
          >
            <FiAlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">We could not load your cart</h2>
            <p className="text-gray-600 mb-6">{catalogError || 'Please try again in a moment.'}</p>
            <button
              onClick={reloadCatalog}
              className="px-6 py-3 rounded-lg text-white bg-[#6a5acd] hover:bg-[#5a4cbb] transition-colors fill-button"
            >
              Try again
            </button>
          </motion.div>
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
          <>
            {unpricedLines.length > 0 && (
              /* FE-024 — a line whose product the catalog cannot produce is not
                 worth zero, it is unknown. It used to be skipped silently, so
                 the total was simply wrong with nothing to show for it. */
              <div
                className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 flex items-start gap-3"
                role="alert"
              >
                <FiAlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span>
                  {unpricedLines.length === 1 ? 'One item is' : `${unpricedLines.length} items are`} no longer
                  in the catalog, so {unpricedLines.length === 1 ? 'it is' : 'they are'} not included in the total below.
                </span>
              </div>
            )}
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Cart Items */}
            <motion.div 
              className="lg:w-2/3"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <AnimatePresence>
                {cartData.map((item) => {
                  const productData = products.find((product) => product._id === item._id);
                  const hasWarning = hasInventoryWarning(item.id);
                  const unidentifiable = isUnidentifiable(item.id);
                  const availableInventory = item.available ?? 0;
                  // The line names its own combination, so the label is read
                  // from the options rather than reconstructed from the key.
                  const variantDisplay = item.variantLabel
                    || getVariantDisplayName(productData, item.variantKey);
                  
                  if (!productData) return null;
                  
                  return (
                    <motion.div 
                      key={item.id}
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
                                onClick={() => updateQuantity(item._id, lineRefOf(item), 0)}
                                className="p-1 text-gray-400 hover:text-[#6a5acd] transition-colors"
                                aria-label="Remove item"
                              >
                                <FiTrash2 className="w-5 h-5" />
                              </button>
                            </div>
                            
                            <div className="mt-1 text-sm text-gray-500">
                              {/* ARCH-003 — `variantDisplay` already names its
                                  axes ("Storage: 1TB"), so the hardcoded
                                  "Size:" prefix rendered "Size: Storage: 1TB"
                                  and was simply wrong on any product whose
                                  axis is not called Size. */}
                              {variantDisplay || 'One Size'}
                            </div>
                            
                            <div className="mt-2 text-lg font-medium text-[#6a5acd]">
                              {formatPrice(getPriceMinor(productData))}
                            </div>
                            
                            <div className="mt-4 flex justify-between items-center">
                              <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                                {/* A11Y-009 — axe reported these two as
                                    *critical* "Buttons must have discernible
                                    text": an icon-only stepper announced as
                                    "button", twice per line, with no way to
                                    tell which was which or what it acted on. */}
                                <button
                                  type="button"
                                  onClick={() => handleQuantityChange(item, Math.max(1, item.quantity - 1))}
                                  aria-label={`Decrease the quantity of ${productData.name}`}
                                  className="px-3 py-1 hover:bg-gray-100 transition-colors"
                                  disabled={item.quantity <= 1}
                                >
                                  <FiMinus aria-hidden="true" className={`w-4 h-4 ${item.quantity <= 1 ? 'text-gray-300' : 'text-[#6a5acd]'}`} />
                                </button>
                                <span className="px-3 py-1 min-w-[40px] text-center">{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => handleQuantityChange(item, item.quantity + 1)}
                                  aria-label={`Increase the quantity of ${productData.name}`}
                                  className="px-3 py-1 hover:bg-gray-100 transition-colors"
                                  disabled={item.quantity >= availableInventory}
                                >
                                  <FiPlus aria-hidden="true" className={`w-4 h-4 ${item.quantity >= availableInventory ? 'text-gray-300' : 'text-[#6a5acd]'}`} />
                                </button>
                              </div>
                              
                              <div className="text-lg font-semibold text-[#6a5acd]">
                                {formatPrice(getPriceMinor(productData) * item.quantity)}
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
                                  {unidentifiable ? (
                                    <>
                                      This option cannot be identified any more.
                                      Please remove it and choose again.
                                    </>
                                  ) : (
                                    <>
                                      Only {availableInventory} item(s) in stock.
                                      Please adjust your quantity.
                                    </>
                                  )}
                                </div>
                              </motion.div>
                            )}
                            
                            {availableInventory === 0 && !unidentifiable && (
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
          </>
        )}
      </motion.div>
    </div>
  )
}

export default Cart