import React, { useContext, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShopContext } from '../context/ShopContext';
import RelatedProducts from '../components/RelatedProducts';
import { toast } from 'react-toastify';

const Product = () => {

  const { productId } = useParams();
  const { products, currency, addToCart } = useContext(ShopContext);
  const [productData, setProductData] = useState(false);
  const [image, setImage] = useState('');
  
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
    
    addToCart(productData._id, getVariantKey());
  };

  return productData ? (
    <div className='px-4 sm:px-[5vw] md:px-[7vw] lg:px-[9vw] pt-24'>
      <div className='border-t-2 pt-10 transition-opacity ease-in duration-500 opacity-100'>
        {/* ------ Product Data ------ */}
        <div className='flex gap-12 sm:gap-12 flex-col sm:flex-row'>
          {/*  ------ Product Images ------  */}
          <div className='flex-1 flex flex-col-reverse gap-3 sm:flex-row'>
            <div className='flex sm:flex-col overflow-x-auto sm:overflow-y-scroll justify-between sm:justify-normal sm:w-[18.7%] w-full'>
              {
                productData.image.map((item, index) => (
                  <img onClick={() => setImage(item)} src={item} key={index} className='w-[24%] sm:w-full sm:mb-3 flex-shrink-0 cursor-pointer' alt="" />
                ))
              }
            </div>
            <div className=' w-full sm:w-[80%]'>
              <img className='w-full h-auto' src={image} alt="" />
            </div>
          </div>
          {/*  ------ Product Details ------  */}
          <div className='flex-1'>
            <h1 className='font-medium text-2xl mt-2'>{productData.name}</h1>
            
            {/* Product Tags */}
            {productData.tags && productData.tags.length > 0 && (
              <div className='flex flex-wrap gap-2 mt-2'>
                {productData.tags.map((tag, index) => (
                  <Link to={`/collections/tag/${tag}`} key={index}>
                    <span className='bg-gray-100 text-gray-800 text-xs px-2 py-1 rounded-full'>
                      {tag}
                    </span>
                  </Link>
                ))}
              </div>
            )}
            
            <p className='mt-5 text-3xl font-medium'>{currency}{productData.price}</p>
            <p className='mt-5 text-gray-500 md:w-4/5'>{productData.description}</p>
            
            {/* Variant Selection */}
            {productData.variants && productData.variants.length > 0 && (
              <div className='flex flex-col gap-4 my-8'>
                {productData.variants.map((variant, variantIndex) => (
                  <div key={variantIndex}>
                    <p>{variant.name}</p>
                    <div className='flex gap-2 flex-wrap mt-1'>
                      {variant.options.map((option, optionIndex) => (
                        <button 
                          key={optionIndex}
                          onClick={() => handleVariantChange(variant.name, option)}
                          className={`border py-2 px-4 bg-gray-100 ${selectedVariants[variant.name] === option ? 'border-orange-500' : ''}`}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                
                {/* Inventory Status */}
                {areAllVariantsSelected() && (
                  <div className='text-sm mt-2'>
                    {isOutOfStock() 
                      ? <span className='text-red-500'>Out of stock</span>
                      : <span className='text-green-600'>In stock ({getAvailableQuantity()} left)</span>
                    }
                  </div>
                )}
              </div>
            )}
            
            <button 
              onClick={handleAddToCart} 
              className={`px-8 py-3 ${!areAllVariantsSelected() || isOutOfStock() ? 'bg-gray-400 cursor-not-allowed' : 'bg-white text-black border border-black fill-button fill-button-black-outline'} text-white`}
            >
              {!areAllVariantsSelected() ? 'SELECT OPTIONS' : isOutOfStock() ? 'OUT OF STOCK' : 'ADD TO CART'}
            </button>
            
            <hr className='mt-8 sm:w-4/5'/>
            <div className='text-sm text-gray-500 mt-5 flex flex-col gap-1'>
              <p>100% Original Product</p>
              <p>Cash on delivery is available on this product</p>
            </div>
          </div>
        </div>
        {/* ------ Description & Review Section ------ */}
        <div className='mt-20'>
          <div className='flex'>
            <b className='border px-5 py-3 text-sm'>Description</b>
          </div>
          <div className='flex flex-col gap-4 border px-6 py-6 text-sm text-gray-500'>
            <p>{productData.description}</p>
          </div>
        </div>
        {/* ------ Related Products ------ */}
        <RelatedProducts category={productData.category} subCategory={productData.subCategory} tags={productData.tags}/>
      </div>
    </div>
  ) : <div className=' opacity-0'></div>
}

export default Product