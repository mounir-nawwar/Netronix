import { canonicalVariantId } from '../lib/variant';
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShopContext } from '../context/shopContext';
import Seo from '../components/Seo';
import { breadcrumbLd, productLd } from '../lib/seo';
import { isSoldOut } from '../lib/productSummary';
import RelatedProducts from '../components/RelatedProducts';
import { toast } from '../lib/toast';
import { motion } from 'framer-motion';
import { FiMinus, FiPlus, FiShoppingBag, FiHeart, FiInfo, FiShield, FiTruck, FiPackage } from 'react-icons/fi';
import BackButton from '../components/BackButton';

const Product = () => {

  const { productId } = useParams();
  const {
    products, addToCart, navigate, addToWishlist, removeFromWishlist,
    isInWishlist, getSingleProduct, availableFor, getPriceMinor, formatPrice,
  } = useContext(ShopContext);
  const [productData, setProductData] = useState(false);
  const [image, setImage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // State for selected variant options
  const [selectedVariants, setSelectedVariants] = useState({});
  const loadGeneration = useRef(0);

  const fetchProductData = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);
    
    // Try to find product in the existing products array first
    const existingProduct = products.find(item => item._id === productId);
    
    if (existingProduct) {
      setProductData(existingProduct);
      setImage(existingProduct.image[0]);
      
      // Initialize selected variants
      const initialSelectedVariants = {};
      if (existingProduct.variants && existingProduct.variants.length > 0) {
        existingProduct.variants.forEach(variant => {
          if (variant.options && variant.options.length > 0) {
            initialSelectedVariants[variant.name] = '';
          }
        });
      }
      setSelectedVariants(initialSelectedVariants);
      setLoading(false);
      return;
    }
    
    // If not found in existing products, fetch directly from API
    try {
      const product = await getSingleProduct(productId);
      if (generation !== loadGeneration.current) return;
      if (product) {
        setProductData(product);
        setImage(product.image[0]);
        
        // Initialize selected variants
        const initialSelectedVariants = {};
        if (product.variants && product.variants.length > 0) {
          product.variants.forEach(variant => {
            if (variant.options && variant.options.length > 0) {
              initialSelectedVariants[variant.name] = '';
            }
          });
        }
        setSelectedVariants(initialSelectedVariants);
      } else {
        toast.error('Product not found');
        navigate('/products');
      }
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      console.error(error);
      toast.error('Error loading product');
      navigate('/products');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [productId, products, getSingleProduct, navigate])

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchProductData();
    // TEST-002 — `fetchProductData` is memoised on `productId` (and on the two
    // context callbacks it calls), so depending on the function is the same
    // refetch behaviour as depending on `[productId]` was, stated honestly.
  }, [fetchProductData])


  /**
   * DB-003 — this guard used to fail **open**.
   *
   * It was:
   *
   *     if (variantKey.split('-').length !== variants.length) return false;
   *
   * `false` meaning "in stock". A hyphenated option value — `16-inch`,
   * `RTX-4090`, `Wi-Fi 6E`, `USB-C`, all of which this catalog sells — inflates
   * the segment count, so the counts never matched, the guard short-circuited,
   * and an unavailable combination rendered as purchasable. The cart key it then
   * produced matched no inventory key, so the server's own check mis-resolved
   * too.
   *
   * Resolution now goes through the shared helper, against the option pairs
   * rather than a string that has to be split back apart, and every path fails
   * **closed**: an incomplete selection, an unknown combination and an ambiguous
   * one all report out of stock.
   */
  const isOutOfStock = () => {
    if (!areAllVariantsSelected()) return true;
    const available = availableFor(productData, { variantOptions: selectedVariants });
    return available === null || available <= 0;
  };

  // Get available quantity for selected variant combination
  const getAvailableQuantity = () => {
    if (!areAllVariantsSelected()) return 0;
    return availableFor(productData, { variantOptions: selectedVariants }) ?? 0;
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
    addToCart(productData._id, { variantOptions: selectedVariants }, quantity);
  };

  // Handle save/unsave for wishlist
  const handleWishlistToggle = () => {
    if (!productData) return;
    
    if (isInWishlist(productData._id)) {
      removeFromWishlist(productData._id);
    } else {
      addToWishlist(productData._id);
    }
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

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        role="status"
        aria-label="Loading product"
      >
        <div
          aria-hidden="true"
          className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6a5acd]"
        />
      </div>
    );
  }

  // Generate the current exact variant ID to compute price display
  const currentVariantId = canonicalVariantId(selectedVariants);
  const displayPrice = getPriceMinor(productData, currentVariantId);

  return productData ? (
    <div className="min-h-screen bg-white pt-[80px] md:pt-[100px] pb-16">
      {/* SEO-001 / SEO-002 / SEO-004 — every product page used to be titled
          "Netronix", with no description and no structured data. Everything
          below is read from the catalog document: the name, the description,
          the real images, and a price and availability derived from the
          minor-unit price and the typed inventory. No AggregateRating and no
          review count, because there are no reviews. */}
      <Seo
        title={productData.name}
        description={
          productData.description
            ? String(productData.description).replace(/\s+/g, ' ').trim().slice(0, 200)
            : `${productData.name} at Netronix.`
        }
        path={`/product/${productData._id}`}
        image={Array.isArray(productData.image) ? productData.image[0] : undefined}
        ogType="product"
        jsonLd={[
          productLd(productData, {
            priceMinor: getPriceMinor(productData),
            inStock: !isSoldOut(productData),
          }),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Products', path: '/products' },
            { name: productData.name, path: `/product/${productData._id}` },
          ]),
        ]}
      />
      <div className="w-[90%] md:w-[85%] lg:w-[80%] max-w-6xl mx-auto">
        {/* Back button */}
        <BackButton className="mb-6" />

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
                {/* A11Y-005 / A11Y-007 — each thumbnail was a `<div onClick>`
                    wrapping an image: unreachable by Tab and announced as
                    nothing, so a keyboard user could not change the view at
                    all. They are `<button>`s with `aria-pressed`, and the
                    image inside is decorative because the button already
                    carries the name. Styling is untouched. */}
                {productData.image.map((img, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Show view ${index + 1} of ${productData.name}`}
                    aria-pressed={img === image}
                    className={`border-2 rounded-lg overflow-hidden cursor-pointer flex-shrink-0 w-20 h-20 
                    ${img === image ? 'border-[#6a5acd]' : 'border-gray-200'}`}
                    onClick={() => setImage(img)}
                  >
                    <img
                      src={img}
                      alt=""
                      width={80}
                      height={80}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>

              {/* Main Image — the zoom toggle was a `<div onClick>` too. */}
              <button
                type="button"
                aria-pressed={isZoomed}
                aria-label={isZoomed ? `Zoom out of ${productData.name}` : `Zoom in on ${productData.name}`}
                className="flex-1 aspect-square rounded-xl overflow-hidden bg-[#f9f9f9] relative cursor-zoom-in"
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
              </button>
            </div>
          </motion.div>

          {/* Product Details */}
          <div className="flex flex-col">
            {/* Brand and name */}
            {productData.brand && (
              <span className="text-[#6a5acd] text-sm tracking-wide uppercase font-michroma mb-1">
                {productData.brand}
              </span>
            )}
            
            <h1 className="text-2xl md:text-3xl font-michroma text-gray-900 mb-2">
              {productData.name}
            </h1>
            
            {/* Tags */}
            {productData.tags && productData.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {productData.tags.map((tag, index) => (
                  <Link to={`/products?${new URLSearchParams({ tag }).toString()}`} key={index}>
                    <span className="bg-[#f5f3ff] text-[#6a5acd] text-xs px-3 py-1 rounded-full font-michroma hover:bg-[#6a5acd] hover:text-white transition-colors">
                      {tag}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            
            {/* Price */}
            <div className="text-2xl md:text-3xl font-michroma text-[#6a5acd] mt-2 mb-4">
              {formatPrice(displayPrice)}
            </div>
            
            {/* Description */}
            <p className="text-gray-600 mb-6 line-clamp-3 relative">
              {productData.description}
            </p>
            
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
                      <label className="block text-gray-700 text-sm font-medium mb-2 font-michroma" id={`variant-axis-${variantIndex}`}>
                        {variant.name}
                      </label>
                      {/* A named group, so each row of options is identifiable
                          as the axis it belongs to — by a screen reader and by a
                          test. The buttons announced only their own value
                          ("Black"), with nothing saying which axis chose it. */}
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`variant-axis-${variantIndex}`}>
                        {variant.options.map((option, optionIndex) => (
                          <button 
                            key={optionIndex}
                            type="button"
                            aria-pressed={selectedVariants[variant.name] === option}
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
                      type="button"
                      aria-label="Decrease quantity"
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
                      type="button"
                      aria-label="Increase quantity"
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
              className="flex gap-4 mb-6"
              variants={fadeIn}
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
              
              <button 
                onClick={handleWishlistToggle}
                className={`py-3 px-6 rounded-md border flex items-center justify-center gap-2 transition-colors fill-button fill-button-purple ${
                  isInWishlist(productData._id) 
                    ? 'bg-[#6a5acd] text-white border-[#6a5acd]' 
                    : 'border-[#6a5acd] text-[#6a5acd]'
                }`}
              >
                <FiHeart 
                  className={`w-5 h-5 ${isInWishlist(productData._id) ? 'fill-white' : ''}`} 
                />
                <span className="font-michroma">
                  {isInWishlist(productData._id) ? 'SAVED' : 'SAVE'}
                </span>
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
          </div>
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
        {/* PERF-003 — `paint-on-approach` is `content-visibility: auto`: the
            strip is the bottom of a page four viewports tall, and the browser
            skips its style, layout and paint until it is approached. It is
            rendered by React on the first pass either way, and stays in the
            accessibility tree and in find-in-page. See `index.css`. */}
        <motion.div
          className="paint-on-approach"
          style={{ '--approach-height': '1045px' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <RelatedProducts tags={productData.tags} />
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