import React, { useContext, useState } from 'react'
import Title from '../components/Title'
import CartTotal from '../components/CartTotal'
import whishLogo from '../assets/all/whishLogo.png';
import cashOnDelivery from '../assets/all/cash-on-delivery.svg';
import { ShopContext } from '../context/ShopContext';
import { toast } from 'react-toastify';
import axios from 'axios';


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

  const onChangeHandler = (event) => {
    const name = event.target.name;
    const value = event.target.value;
    setFormData(data => ({ ...data, [name]: value }));

  }

  const onSubmitHandler = async (event) => {
    event.preventDefault();
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
        return;
      }

      let orderData = {
        // userId is extracted from token by the auth middleware
        address: formData,
        items: orderItems,
        amount: getCartAmount() + delivery_fee,
        paymentMethod: method.toUpperCase()
      }

      console.log('Submitting order with data:', orderData);
      console.log('Token in headers:', token);

      switch (method) {
        //API calls for Cod
        case 'cod':
          try {
            const codResponse = await axios.post(backendUrl + '/api/order/place', orderData, {headers:{token}});
            console.log('Server response:', codResponse);
            if(codResponse.data.success){
              setCartItems({});
              toast.success('Order placed successfully!');
              navigate('/orders');
            } else {
              console.log('Order failed:', codResponse.data);
              toast.error(codResponse.data.message || 'Order placement failed');
            }
          } catch (error) {
            console.error('Order error:', error.response?.data || error);
            toast.error(error.response?.data?.message || error.message || 'Order placement failed');
          }
          break;

        case 'whish':
          try {
            const whishResponse = await axios.post(backendUrl + '/api/order/place', orderData, {headers:{token}});
            console.log('Server response:', whishResponse);
            if(whishResponse.data.success){
              setCartItems({});
              toast.success('Order placed successfully!');
              navigate('/orders');
            } else {
              console.log('Order failed:', whishResponse.data);
              toast.error(whishResponse.data.message || 'Order placement failed');
            }
          } catch (error) {
            console.error('Order error:', error.response?.data || error);
            toast.error(error.response?.data?.message || error.message || 'Order placement failed');
          }
          break;
          
        default:
          break;

      }
    } catch (error) {
      console.log(error);
      toast.error(error.message);
    }

  }

  return (
    <form onSubmit={onSubmitHandler} className='px-4 sm:px-[5vw] md:px-[7vw] lg:px-[9vw] flex flex-col sm:flex-row justify-between gap-4 pt-5 sm:pt-14 min-h-[80vh] border-t'>
      {/* -------------------- Left side ----------------- */}
      <div className='flex flex-col gap-4 w-full sm:max-w-[480px]'>
        <div className='text-xl sm:text-2xl my-3'>
          <Title text1={'DELIVERY'} text2={'INFORMATION'} />
        </div>
        <div className='flex gap-3'>
          <input required onChange={onChangeHandler} name='firstName' value={formData.firstName} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' type="text" placeholder='First name' />
          <input required onChange={onChangeHandler} name='lastName' value={formData.lastName} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' type="text" placeholder='Last name' />
        </div>
        <input required onChange={onChangeHandler} name='email' value={formData.email} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' type="email" placeholder='Email Address' />
        <input required onChange={onChangeHandler} name='street' value={formData.street} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' type="text" placeholder='Street' />
        <div className='flex gap-3'>
          <input required onChange={onChangeHandler} name='city' value={formData.city} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' type="text" placeholder='City' />
          <input required onChange={onChangeHandler} name='state' value={formData.state} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' type="text" placeholder='State' />
        </div>
        <div className='flex gap-3'>
          <input required onChange={onChangeHandler} name='zipcode' value={formData.zipcode} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' type="number" placeholder='Zipcode' />
          <input required onChange={onChangeHandler} name='country' value={formData.country} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' type="text" placeholder='Country' />
        </div>
        <input required onChange={onChangeHandler} name='phone' value={formData.phone} className='border border-gray-300 rounded py-1.5 px-3.5 w-full' type="number" placeholder='Phone Number' />
      </div>
      {/* ------------------------ Right Side ----------------------- */}
      <div className='mt-8'>
        <div className='mt-8 min-w-80'>
          <CartTotal />
        </div>
        <div className='mt-12'>
          <Title text1={'PAYMENT'} text2={'METHOD'} />
          {/* PAYMENT METHOD SELECTION */}
          <div onClick={() => setMethod('whish')} className='flex gap-3 flex-col lg:flex-row'>
            <div className='flex items-center gap-3 border p-2 px-3 cursor-pointer'>
              <p className={`min-w-3.5 h-3.5 border rounded-full ${method === 'whish' ? 'bg-green-400 ' : ''}`}></p>
              <img className='h-5 mx-4' src={whishLogo} alt="" />
            </div>
            <div onClick={() => setMethod('cod')} className='flex items-center gap-3 border p-2 px-3 cursor-pointer'>
              <p className={`min-w-3.5 h-3.5 border rounded-full ${method === 'cod' ? 'bg-green-400 ' : ''}`}></p>
              <p className='text-gray-950 text-sm font-medium mx-4'>CASH ON DELIVERY</p>
            </div>
          </div>

          <div className='w-full text-end mt-8'>
            <button type='submit' className='bg-black text-white px-16 py-3 text-sm'>PLACE ORDER</button>
          </div>
        </div>
      </div>
    </form>
  )
}

export default PlaceOrder