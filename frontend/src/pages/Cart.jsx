import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext';
import Title from '../components/Title';
import { FaTrashCan } from "react-icons/fa6";
import CartTotal from '../components/CartTotal';
import { toast } from 'react-toastify';

const Cart = () => {

  const { products, currency, cartItems, updateQuantity, navigate, getVariantDisplayName } = useContext(ShopContext);

  const [cartData, setCartData] = useState([]);
  const [inventoryWarnings, setInventoryWarnings] = useState({});

  useEffect(() => {
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
    };
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

  return (
    <div className='border-t pt-14 px-4 sm:px-[5vw] md:px-[7vw] lg:px-[9vw]'>

      <div className='text-2xl mb-3'>
        <Title text1={'YOUR'} text2={'CART'} />
      </div>

      <div>
        {
          cartData.map((item, index) => {

            const productData = products.find((product) => product._id === item._id);
            const hasWarning = hasInventoryWarning(item._id, item.variantKey);
            const availableInventory = getAvailableInventory(item._id, item.variantKey);
            const variantDisplay = getVariantDisplayName(productData, item.variantKey);

            return (
              <div key={index} className='py-4 border-t border-b text-gray-700 grid grid-cols-[4fr_0.5fr_0.5fr] sm:grid-cols-[4fr_2fr_2fr] items-center gap-4'>
                <div className='flex items-start gap-6'>
                  <img className='w-16 sm:w-20' src={productData.image[0]} alt="" />
                  <div>
                    <p className='text-xs sm:text-lg font-medium'>{productData.name}</p>
                    <div className='flex items-center gap-5 mt-2'>
                      <p>{currency}{productData.price}</p>
                      <p className='px-2 sm:px-3 sm:py-1 border-bg bg-slate-50'>{variantDisplay}</p>
                    </div>
                    {hasWarning && (
                      <p className='text-red-500 text-xs mt-1'>
                        Only {availableInventory} items available. Quantity adjusted.
                      </p>
                    )}
                    {availableInventory === 0 && (
                      <p className='text-red-500 text-xs mt-1'>
                        Out of stock. Please remove this item.
                      </p>
                    )}
                  </div>
                </div>
                <input 
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === '' || value === '0') return;
                    handleQuantityChange(item._id, item.variantKey, Number(value));
                  }} 
                  className='border max-w-10 sm:max-w-20 px-1 sm:px-2 py-1' 
                  type="number" 
                  min={1} 
                  max={availableInventory}
                  value={item.quantity} 
                />
                <FaTrashCan onClick={() => updateQuantity(item._id, item.variantKey, 0)} className='w-4 mr-4 sm:w-5 cursor-pointer text-black-700' />
              </div>
            )
          })
        }
      </div>

      <div className='flex justify-end my-20'>
        <div className='w-full sm:w-[450px]'>
          <CartTotal />
          <div className='w-full text-end'>
            <button 
              onClick={() => {
                // Check if any items have inventory warnings before proceeding
                if (Object.keys(inventoryWarnings).length > 0) {
                  toast.error('Please resolve inventory issues before checkout');
                  return;
                }
                navigate('/placeorder');
              }} 
              className='bg-black text-white text-sm my-8 px-8 py-3'
            >
              PROCEED TO CHECKOUT
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Cart