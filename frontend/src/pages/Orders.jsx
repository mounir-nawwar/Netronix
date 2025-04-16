import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import Title from '../components/Title'
import axios from 'axios'
import { toast } from 'react-toastify'

const Orders = () => {

  const { backendUrl, token, currency, products } = useContext(ShopContext)
  const [orderData, setOrderData] = useState([]);

  const loadOrderData = async () => {

    try {

      if (!token) return null;

      const response = await axios.post(backendUrl + '/api/order/userorders', {}, { headers: { token } });
      if (response.data.success) {
        let allOrdersItem = []
        response.data.orders.map((order) => {
          order.items.map((item) => {
            // Find the product details from the products context
            const productDetails = products.find(p => p._id === item.productId) || {};
            
            // Create a new item with all necessary properties
            const enrichedItem = {
              ...item,
              ...productDetails, // Add product details (name, image, etc.)
              status: order.status,
              payment: order.payment,
              paymentMethod: order.paymentMethod,
              date: order.date
            };
            
            allOrdersItem.push(enrichedItem);
          })
        })
        setOrderData(allOrdersItem.reverse());
      } else {
        toast.error(response.data.message);
      }

    } catch (error) {
      console.log(error);
      toast.error(error.response?.data?.message || error.message);
    }

  }

  useEffect(() => {
    loadOrderData();
  }, [products]) // Add products as a dependency to reload when products are loaded

  return (
    <div className='px-4 sm:px-[5vw] md:px-[7vw] lg:px-[9vw] border-t pt-16'>
      <div className='text-2xl'>
        <Title text1={'MY'} text2={'ORDERS'} />
      </div>

      <div >
        {orderData.length === 0 ? (
          <p className="text-center py-8">No orders found. Start shopping!</p>
        ) : (
          orderData.map((item, index) => (
            <div key={index} className='py-4 border-t border-b text-gray-700 flex flex-col md:flex-row md:items-center md:justify-between gap-4'>
              <div className='flex items-start gap-6 text-sm'>
                <img 
                  className='w-16 sm:w-20' 
                  src={item.image && item.image[0]} 
                  alt={item.name || 'Product'} 
                />
                <div>
                  <p className='sm:text-base font-medium'>{item.name || 'Product'}</p>
                  <div className='flex items-center gap-3 mt-1 text-base text-gray-950'>
                    <p>{currency}{item.price || 0}</p>
                    <p>Quantity: {item.quantity || 1}</p>
                    <p>Size: {item.size || 'N/A'}</p>
                  </div>
                  <p className='mt-1'>Date: <span className='text-gray-400 '>{item.date ? new Date(item.date).toLocaleDateString() : 'N/A'}</span></p>
                  <p className='mt-1'>Payment: <span className='text-gray-400 '>{item.paymentMethod || 'N/A'}</span></p>
                </div>
              </div>
              <div className='md:w-1/2 flex justify-between'>
                <div className='flex items-center gap-2'>
                  <p className='min-w-2 h-2 rounded-full bg-green-500'></p>
                  <p className='text-sm md:text-base'>{item.status || 'Processing'}</p>
                </div>
                <button onClick={loadOrderData} className='border px-4 py-2 text-sm font-medium rounded-sm'>Track Order</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default Orders