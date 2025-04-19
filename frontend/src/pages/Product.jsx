import React, { useContext, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShopContext } from '../context/ShopContext';
import RelatedProducts from '../components/RelatedProducts';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { FiMinus, FiPlus, FiShoppingBag, FiHeart, FiInfo, FiArrowLeft, FiShield, FiTruck, FiPackage } from 'react-icons/fi';

const Product = () => {

  const { productId } = useParams();
  const { products, currency, addToCart, navigate } = useContext(ShopContext);
  const [productData, setProductData] = useState(false);
  const [image, setImage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  
  // State for selected variant options
  const [selectedVariants, setSelectedVariants] = useState({});

  const fetchProductData = async () => {
    products.map((item) => {
      if (item._id === productId) {
        setProductData(item);
        setImage(item.image[0]);
        
        // Initialize selected variants
        const initialSelectedVariants = {};
        if (item.variants && item.variants.length > 0) {
          item.variants.forEach(variant => {
            if (variant.options && variant.options.length > 0) {
              initialSelectedVariants[variant.name] = '';
            }
          });
        }
        setSelectedVariants(initialSelectedVariants);
        
        return null;
      }
    })
  }

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchProductData();
  }, [productId])

  // Generate variant combination key
  const getVariantKey = () => {
    if (!productData || !productData.variants) return '';
    
    return productData.variants
      .map(variant => selectedVariants[variant.name])
      .filter(option => option) // filter out empty values
      .join('-');
  };

  // Check if a variant combination is out of stock
  const isOutOfStock = () => {
    const variantKey = getVariantKey();
    
    // If not all variants are selected, consider it in stock
    if (variantKey.split('-').length !== (productData?.variants?.length || 0)) {
      return false;
    }
    
    if (!productData.inventory || !productData.inventory[variantKey]) {
      return true; // No inventory data means out of stock
    }
    
    return productData.inventory[variantKey] <= 0;
  };

  // Get available quantity for selected variant combination
  const getAvailableQuantity = () => {
    const variantKey = getVariantKey();
    
    if (!productData.inventory || !productData.inventory[variantKey]) {
      return 0;
    }
    
    return productData.inventory[variantKey];
  };

  // Check if all variants are selected
  const areAllVariantsSelected = () => {
    if (!productData || !productData.variants || productData.variants.length === 0) {
      return true;
    }
    
    return productData.variants.every(variant => 
      selectedVariants[variant.name] && selectedVariants[variant.name] !== ''
    );
  };

  // Handle variant selection
  const handleVariantChange = (variantName, option) => {
    setSelectedVariants(prev => ({
      ...prev,
      [variantName]: option
    }));
  };

  // Manage quantity
  const increaseQuantity = () => {
    if (quantity < getAvailableQuantity()) {
      setQuantity(prev => prev + 1);
    } else {
      toast.warning(`Only ${getAvailableQuantity()} items available`);
    }
  };

  const decreaseQuantity = () => {
    if (quantity > 1) {
      setQuantity(prev => prev - 1);
    }
  };

  // Handle add to cart with inventory check
  const handleAddToCart = () => {
    if (!areAllVariantsSelected()) {
      toast.error('Please select all options');
      return;
    }
    
    if (isOutOfStock()) {
      toast.error('This combination is out of stock');
      return;
    }

    // Add to cart with the selected quantity (not in a loop anymore)
    addToCart(productData._id, getVariantKey(), quantity);
  };

  // Animation variants
  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5 }
    }
  };

  const imageHover = {
    hover: { scale: 1.05 }
  };

  return productData ? (
    <div className="min-h-screen bg-white pt-[80px] md:pt-[100px] pb-16">
      <div className="w-[90%] md:w-[85%] lg:w-[80%] max-w-6xl mx-auto">
        {/* Back button */}
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-2 text-gray-600 hover:text-[#6a5acd] transition-colors mb-6"
          onClick={() => navigate(-1)}
        >
          <FiArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back</span>
        </motion.button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          {/* Product Images */}
          <motion.div 
            className="w-full"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
          >
            <div className="flex flex-col-reverse md:flex-row gap-4">
              {/* Thumbnails */}
              <div className="flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto md:w-24 pb-2 md:pb-0">
                {productData.image.map((img, index) => (
                  <div 
                    key={index}
                    className={`border-2 rounded-lg overflow-hidden cursor-pointer flex-shrink-0 w-20 h-20 
                    ${img === image ? 'border-[#6a5acd]' : 'border-gray-200'}`}
                    onClick={() => setImage(img)}
                  >
                    <img 
                      src={img} 
                      alt={`${productData.name} - view ${index + 1}`} 
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>

              {/* Main Image */}
              <div 
                className="flex-1 rounded-xl overflow-hidden bg-[#f9f9f9] relative cursor-zoom-in"
                onClick={() => setIsZoomed(!isZoomed)}
              >
                <motion.img
                  src={image}
                  alt={productData.name}
                  className={`w-full h-full object-contain ${isZoomed ? 'md:cursor-zoom-out' : 'md:cursor-zoom-in'}`}
                  variants={imageHover}
                  whileHover="hover"
                  transition={{ duration: 0.3 }}
                  style={{ maxHeight: isZoomed ? '700px' : '500px' }}
                />
              </div>
            </div>
          </motion.div>

          {/* Product Details */}
          <motion.div
            className="flex flex-col"
            variants={fadeIn}
            initial="hidden"
            animate="visible"
          >
            {/* Brand and name */}
            {productData.brand && (
              <motion.span 
                className="text-[#6a5acd] text-sm tracking-wide uppercase font-michroma mb-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                {productData.brand}
              </motion.span>
            )}
            
            <motion.h1 
              className="text-2xl md:text-3xl font-michroma text-gray-900 mb-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              {productData.name}
            </motion.h1>
            
            {/* Tags */}
            {productData.tags && productData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {productData.tags.map((tag, index) => (
                  <Link to={`/collections/tag/${tag}`} key={index}>
                    <span className="bg-[#f5f3ff] text-[#6a5acd] text-xs px-3 py-1 rounded-full font-michroma hover:bg-[#6a5acd] hover:text-white transition-colors">
                      {tag}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            
            {/* Price */}
            <motion.div 
              className="text-2xl md:text-3xl font-michroma text-[#6a5acd] mt-2 mb-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              {currency}{productData.price}
            </motion.div>
            
            {/* Description */}
            <motion.p 
              className="text-gray-600 mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {productData.description}
            </motion.p>
            
            <div className="space-y-6 mb-8">
              {/* Variant Selections */}
              {productData.variants && productData.variants.length > 0 && (
                <div className="space-y-4">
                  {productData.variants.map((variant, variantIndex) => (
                    <motion.div 
                      key={variantIndex}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 + (variantIndex * 0.1) }}
                    >
                      <label className="block text-gray-700 text-sm font-medium mb-2 font-michroma">
                        {variant.name}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {variant.options.map((option, optionIndex) => (
                          <button 
                            key={optionIndex}
                            onClick={() => handleVariantChange(variant.name, option)}
                            className={`px-4 py-2 rounded-md border transition-all ${
                              selectedVariants[variant.name] === option 
                                ? 'border-[#6a5acd] bg-[#f5f3ff] text-[#6a5acd] font-medium' 
                                : 'border-gray-300 hover:border-[#6a5acd] hover:text-[#6a5acd]'
                            }`}
                          >
                            {option}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
              
              {/* Inventory Status */}
              {areAllVariantsSelected() && (
                <motion.div 
                  className="flex items-center gap-2 text-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.7 }}
                >
                  <FiInfo className={`${isOutOfStock() ? 'text-red-500' : 'text-green-600'}`} />
                  {isOutOfStock() 
                    ? <span className="text-red-500 font-medium">Out of stock</span>
                    : <span className="text-green-600 font-medium">In stock ({getAvailableQuantity()} available)</span>
                  }
                </motion.div>
              )}
              
              {/* Quantity Selector */}
              {areAllVariantsSelected() && !isOutOfStock() && (
                <motion.div 
                  className="mt-4"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <label className="block text-gray-700 text-sm font-medium mb-2 font-michroma">
                    Quantity
                  </label>
                  <div className="flex items-center">
                    <button 
                      onClick={decreaseQuantity}
                      disabled={quantity <= 1}
                      className={`w-10 h-10 flex items-center justify-center border border-gray-300 rounded-l-md ${
                        quantity <= 1 ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <FiMinus className="w-4 h-4" />
                    </button>
                    <div className="w-14 h-10 flex items-center justify-center border-t border-b border-gray-300 bg-white">
                      {quantity}
                    </div>
                    <button 
                      onClick={increaseQuantity}
                      disabled={quantity >= getAvailableQuantity()}
                      className={`w-10 h-10 flex items-center justify-center border border-gray-300 rounded-r-md ${
                        quantity >= getAvailableQuantity() ? 'text-gray-400 cursor-not-allowed' : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <FiPlus className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </div>
            
            {/* Action Buttons */}
            <motion.div 
              className="flex flex-col sm:flex-row gap-3 mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
            >
              <button 
                onClick={handleAddToCart}
                disabled={!areAllVariantsSelected() || isOutOfStock()}
                className={`py-3 px-6 rounded-md flex-1 flex items-center justify-center gap-2 font-michroma transition-all ${
                  !areAllVariantsSelected() || isOutOfStock()
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-[#6a5acd] text-white hover:bg-[#5d4ebd] fill-button'
                }`}
              >
                <FiShoppingBag className="w-5 h-5" />
                <span>
                  {!areAllVariantsSelected()
                    ? 'SELECT OPTIONS' 
                    : isOutOfStock() 
                    ? 'OUT OF STOCK' 
                    : 'ADD TO CART'}
                </span>
              </button>
              
              <button className="py-3 px-6 rounded-md border border-[#6a5acd] text-[#6a5acd] hover:text-white flex items-center justify-center gap-2 transition-colors fill-button fill-button-purple">
                <FiHeart className="w-5 h-5" />
                <span className="font-michroma">SAVE</span>
              </button>
            </motion.div>
            
            {/* Product features */}
            <motion.div 
              className="border-t border-gray-200 pt-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <FiShield className="w-5 h-5 text-[#6a5acd]" />
                  <span className="text-sm text-gray-600">100% Original Product</span>
                </div>
                <div className="flex items-center gap-3">
                  <FiTruck className="w-5 h-5 text-[#6a5acd]" />
                  <span className="text-sm text-gray-600">Fast Shipping</span>
                </div>
                <div className="flex items-center gap-3">
                  <FiPackage className="w-5 h-5 text-[#6a5acd]" />
                  <span className="text-sm text-gray-600">Secure Packaging</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        </div>
        
        {/* Product Details Tabs */}
        <motion.div 
          className="mt-16 border-t border-gray-200 pt-8"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
        >
          <div className="border-b border-gray-200">
            <div className="inline-block border-b-2 border-[#6a5acd] pb-2 font-michroma text-[#6a5acd]">
              Details
            </div>
          </div>
          <div className="py-6 text-gray-600">
            <p>{productData.description}</p>
            
            {/* Additional details if available */}
            {productData.brand && (
              <div className="mt-4">
                <strong className="text-gray-800">Brand:</strong> {productData.brand}
              </div>
            )}
          </div>
        </motion.div>
        
        {/* Related Products */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <RelatedProducts category={productData.category} subCategory={productData.subCategory} tags={productData.tags}/>
        </motion.div>
      </div>
    </div>
  ) : (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6a5acd]"></div>
    </div>
  );
}

export default Product;