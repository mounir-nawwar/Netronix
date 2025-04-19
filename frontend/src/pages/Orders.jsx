import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import axios from 'axios'
import { toast } from 'react-toastify'
import { motion } from 'framer-motion'
import { FiPackage, FiClock, FiCheckCircle, FiCreditCard, FiCalendar, FiTruck } from 'react-icons/fi'

const Orders = () => {

  const { backendUrl, token, currency, products } = useContext(ShopContext)
  const [orderData, setOrderData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadOrderData = async () => {
    setIsLoading(true);
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
              date: order.date,
              orderId: order._id,
              orderNumber: order.orderNumber || order._id
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
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadOrderData();
  }, [products]) // Add products as a dependency to reload when products are loaded

  // Add a function to display order number or ID
  const getOrderDisplay = (item) => {
    return item.orderNumber ? `#${item.orderNumber}` : `#${item.orderId}`;
  };

  // Status indicator helper
  const getStatusIcon = (status) => {
    switch (status) {
      case 'Order Placed':
        return <FiPackage className="text-blue-500" />;
      case 'Packing':
        return <FiPackage className="text-yellow-500" />;
      case 'Shipped':
        return <FiTruck className="text-purple-500" />;
      case 'Out for Delivery':
        return <FiTruck className="text-orange-500" />;
      case 'Delivered':
        return <FiCheckCircle className="text-green-500" />;
      default:
        return <FiClock className="text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Order Placed':
        return 'bg-blue-500';
      case 'Packing':
        return 'bg-yellow-500';
      case 'Shipped':
        return 'bg-purple-500';
      case 'Out for Delivery':
        return 'bg-indigo-500';
      case 'Delivered':
        return 'bg-green-500';
      default:
        return 'bg-gray-500';
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
        <motion.h1 
          className="text-3xl font-bold text-gray-900 mb-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          My Orders
        </motion.h1>
        <motion.p 
          className="text-gray-600 mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          Track and manage your purchases
        </motion.p>

        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-black"></div>
          </div>
        ) : orderData.length === 0 ? (
          <motion.div 
            className="bg-white rounded-xl shadow-md p-10 text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <FiPackage className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">No orders found</h2>
            <p className="text-gray-600 mb-6">You haven't placed any orders yet.</p>
            <button 
              onClick={() => window.location.href = '/collections/all'} 
              className="px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              Start Shopping
            </button>
          </motion.div>
        ) : (
          <motion.div 
            className="space-y-6"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            {orderData.map((item, index) => (
              <motion.div 
                key={`${item.orderId}-${index}`}
                className="bg-white rounded-xl shadow-md overflow-hidden transition-all hover:shadow-lg"
                variants={itemVariants}
              >
                <div className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center gap-6">
                    {/* Product Image */}
                    <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                      {item.image && item.image[0] ? (
                        <img 
                          className="w-full h-full object-cover" 
                          src={item.image[0]} 
                          alt={item.name || 'Product'} 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                          <FiPackage className="w-10 h-10 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Product Details */}
                    <div className="flex-grow">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">{item.name || 'Product'}</h3>
                      <div className="flex flex-wrap gap-3 text-sm text-gray-600 mb-2">
                        <span className="inline-flex items-center bg-gray-100 rounded-full px-3 py-1">
                          Order {getOrderDisplay(item)}
                        </span>
                        <span className="inline-flex items-center bg-gray-100 rounded-full px-3 py-1">
                          {currency}{item.price || 0}
                        </span>
                        <span className="inline-flex items-center bg-gray-100 rounded-full px-3 py-1">
                          Qty: {item.quantity || 1}
                        </span>
                        <span className="inline-flex items-center bg-gray-100 rounded-full px-3 py-1">
                          Size: {item.size || 'N/A'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <FiCalendar className="w-4 h-4" />
                          {item.date ? new Date(item.date).toLocaleDateString() : 'N/A'}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <FiCreditCard className="w-4 h-4" />
                          {item.paymentMethod || 'N/A'}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex flex-col items-center md:items-end gap-2 mt-4 md:mt-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(item.status)}`}></div>
                        <span className="font-medium text-gray-900">{item.status || 'Processing'}</span>
                      </div>
                      <button
                        onClick={loadOrderData}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                      >
                        Track Order
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </motion.div>
    </div>
  )
}

export default Orders