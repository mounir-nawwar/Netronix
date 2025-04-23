import React, { useContext, useState } from 'react'
import { ShopContext } from '../context/ShopContext';
import { toast } from 'react-toastify';
import { motion } from 'framer-motion';
import { FiShoppingBag, FiChevronLeft, FiCreditCard, FiHome, FiCheck, FiPackage, FiAlertCircle } from 'react-icons/fi';
import CartTotal from '../components/CartTotal'
import axios from 'axios';
import whishLogo from '../assets/all/whishLogo.png';
import BackButton from '../components/BackButton';

const PlaceOrder = () => {

  const [method, setMethod] = useState('cod');
  const { navigate, backendUrl, token, cartItems, setCartItems, getCartAmount, delivery_fee, products } = useContext(ShopContext);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    street: '',
    city: '',
    state: '',
    zipcode: '',
    country: '',
    phone: ''
  })
  const [isSubmitting, setIsSubmitting] = useState(false);

  const onChangeHandler = (event) => {
    const name = event.target.name;
    const value = event.target.value;
    setFormData(data => ({ ...data, [name]: value }));
  }

  const onSubmitHandler = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    
    try {
      let orderItems = [];

      for (const productId in cartItems) {
        for (const size in cartItems[productId]) {
          if (cartItems[productId][size] > 0) {
            // Create a simplified order item with only the necessary fields
            orderItems.push({
              productId: productId,
              size: size,
              quantity: cartItems[productId][size]
            });
          }
        }
      }

      // Check if we have items to order
      if (orderItems.length === 0) {
        toast.error('Your cart is empty');
        setIsSubmitting(false);
        return;
      }

      let orderData = {
        // userId is extracted from token by the auth middleware
        address: formData,
        items: orderItems,
        amount: getCartAmount() + delivery_fee,
        paymentMethod: method.toUpperCase(),
        subtotal: getCartAmount(),
        delivery_fee: delivery_fee
      }

      console.log('Submitting order with data:', orderData);
      console.log('Token in headers:', token);

      // Process the order based on payment method
      try {
        const response = await axios.post(backendUrl + '/api/order/place', orderData, {headers:{token}});
        console.log('Server response:', response);
        if(response.data.success){
          setCartItems({});
          toast.success('Order placed successfully!');
          navigate('/orders');
        } else {
          console.log('Order failed:', response.data);
          toast.error(response.data.message || 'Order placement failed');
        }
      } catch (error) {
        console.error('Order error:', error.response?.data || error);
        toast.error(error.response?.data?.message || error.message || 'Order placement failed');
      }
    } catch (error) {
      console.log(error);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 px-4 sm:px-6 lg:px-8 py-12 pt-[80px] md:pt-[100px]">
      <motion.div 
        className="max-w-6xl mx-auto"
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
            Checkout
          </motion.h1>
        </div>

        <form onSubmit={onSubmitHandler} className="flex flex-col lg:flex-row gap-8">
          {/* Left Column - Delivery Information */}
          <motion.div 
            className="lg:w-2/3"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <FiHome className="w-5 h-5 text-[#6a5acd]" />
                <h2 className="text-xl font-bold text-gray-900">Delivery Information</h2>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input 
                    required 
                    onChange={onChangeHandler} 
                    name='firstName' 
                    value={formData.firstName} 
                    className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent' 
                    type="text" 
                    placeholder='First name' 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input 
                    required 
                    onChange={onChangeHandler} 
                    name='lastName' 
                    value={formData.lastName} 
                    className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent' 
                    type="text" 
                    placeholder='Last name' 
                  />
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input 
                  required 
                  onChange={onChangeHandler} 
                  name='email' 
                  value={formData.email} 
                  className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent' 
                  type="email" 
                  placeholder='Email Address' 
                />
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                <input 
                  required 
                  onChange={onChangeHandler} 
                  name='street' 
                  value={formData.street} 
                  className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent' 
                  type="text" 
                  placeholder='Street' 
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input 
                    required 
                    onChange={onChangeHandler} 
                    name='city' 
                    value={formData.city} 
                    className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent' 
                    type="text" 
                    placeholder='City' 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State/Province</label>
                  <input 
                    required 
                    onChange={onChangeHandler} 
                    name='state' 
                    value={formData.state} 
                    className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent' 
                    type="text" 
                    placeholder='State/Province' 
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zip/Postal Code</label>
                  <input 
                    required 
                    onChange={onChangeHandler} 
                    name='zipcode' 
                    value={formData.zipcode} 
                    className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent' 
                    type="number" 
                    placeholder='Zip/Postal Code' 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input 
                    required 
                    onChange={onChangeHandler} 
                    name='country' 
                    value={formData.country} 
                    className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent' 
                    type="text" 
                    placeholder='Country' 
                  />
                </div>
              </div>
              
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input 
                  required 
                  onChange={onChangeHandler} 
                  name='phone' 
                  value={formData.phone} 
                  className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent' 
                  type="number" 
                  placeholder='Phone Number' 
                />
              </div>
            </div>
            
            {/* Payment Method Section */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-6">
                <FiCreditCard className="w-5 h-5 text-[#6a5acd]" />
                <h2 className="text-xl font-bold text-gray-900">Payment Method</h2>
              </div>
              
              <div className="space-y-3">
                <div 
                  onClick={() => setMethod('whish')}
                  className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                    method === 'whish' 
                      ? 'border-[#6a5acd] bg-gray-50' 
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    method === 'whish' 
                      ? 'border-[#6a5acd]' 
                      : 'border-gray-300'
                  }`}>
                    {method === 'whish' && <div className="w-3 h-3 bg-[#6a5acd] rounded-full"></div>}
                  </div>
                  <div className="ml-4 flex items-center">
                    <img className="h-6" src={whishLogo} alt="Whish Payment" />
                    <span className="ml-2 text-sm font-medium text-gray-700">Whish Payment</span>
                  </div>
                </div>
                
                <div 
                  onClick={() => setMethod('cod')}
                  className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                    method === 'cod' 
                      ? 'border-[#6a5acd] bg-gray-50' 
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                    method === 'cod' 
                      ? 'border-[#6a5acd]' 
                      : 'border-gray-300'
                  }`}>
                    {method === 'cod' && <div className="w-3 h-3 bg-[#6a5acd] rounded-full"></div>}
                  </div>
                  <div className="ml-4 flex items-center">
                    <FiPackage className="w-5 h-5 text-[#6a5acd]" />
                    <span className="ml-2 text-sm font-medium text-gray-700">Cash on Delivery</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Right Column - Order Summary */}
          <motion.div 
            className="lg:w-1/3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            <div className="bg-white rounded-xl shadow-md p-6 sticky top-24">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Order Summary</h2>
              
              <CartTotal />
              
              <button 
                type="submit"
                disabled={isSubmitting}
                className={`mt-6 w-full flex justify-center items-center gap-2 px-6 py-3 rounded-lg text-white font-medium transition-colors fill-button ${
                  isSubmitting 
                    ? 'bg-gray-400 cursor-not-allowed' 
                    : 'bg-[#6a5acd] hover:bg-[#5a4cbb]'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-5 h-5 border-t-2 border-b-2 border-white rounded-full animate-spin"></div>
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>Place Order</span>
                    <FiCheck className="w-4 h-4" />
                  </>
                )}
              </button>
              
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center justify-center">
                  <FiShoppingBag className="w-5 h-5 text-[#6a5acd] mr-2" />
                  <button 
                    type="button"
                    onClick={() => navigate('/cart')}
                    className="text-center text-[#6a5acd] hover:text-[#5a4cbb] transition-colors text-sm underline"
                  >
                    Return to Cart
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </form>
      </motion.div>
    </div>
  )
}

export default PlaceOrder