import React, { useEffect, useState } from 'react';
 import axios from 'axios';
 import { backendUrl, currency } from '../App';
 import { toast } from 'react-toastify';
import { FiPackage, FiInfo, FiMapPin, FiPhone, FiCalendar, FiCreditCard, FiTag, FiUser, FiSearch, FiChevronDown, FiChevronRight } from 'react-icons/fi';
 
 const Orders = ({ token }) => {
   const [orderData, setOrderData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
 
   const fetchAllOrders = async () => {
     if (!token) return null;
 
    setLoading(true);
     try {
      const response = await axios.post(backendUrl + '/api/order/list', {}, { headers: { token } });
       if (response.data.success) {
         setOrderData(response.data.orders.reverse());
       } else {
         toast.error(response.data.message);
       }
     } catch (error) {
       console.log(error);
       toast.error(error.message);
    } finally {
      setLoading(false);
     }
  };
 
   const statusHandler = async (event, orderId) => {
     try {
      const response = await axios.post(
        backendUrl + '/api/order/status',
        { orderId, status: event.target.value },
        { headers: { token } }
      );
       if (response.data.success) {
         await fetchAllOrders();
        toast.success('Order status updated successfully');
       }
     } catch (error) {
       console.log(error);
       toast.error(error.message);
     }
  };
 
   useEffect(() => {
     fetchAllOrders();
  }, [token]);

  // Filter orders based on search term and status filter
  const filteredOrders = orderData.filter((order) => {
    // Filter by search term
    const searchMatch =
      searchTerm === '' ||
      order._id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (order.address.firstName + ' ' + order.address.lastName)
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
      order.items.some((item) => 
        item.name && item.name.toLowerCase().includes(searchTerm.toLowerCase())
      );

    // Filter by status
    const statusMatch = filterStatus === 'All' || order.status === filterStatus;

    return searchMatch && statusMatch;
  });

  // Determine status color class
  const getStatusColor = (status) => {
    switch (status) {
      case 'Order Placed':
        return 'bg-blue-100 text-blue-800';
      case 'Packing':
        return 'bg-yellow-100 text-yellow-800';
      case 'Shipped':
        return 'bg-indigo-100 text-indigo-800';
      case 'Out for Delivery':
        return 'bg-purple-100 text-purple-800';
      case 'Delivered':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Format date
  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };
 
   return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Orders Management</h1>
        <div className="mt-4 md:mt-0 w-full md:w-auto flex flex-col sm:flex-row gap-3">
          {/* Search field */}
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <FiSearch className="w-4 h-4 text-gray-500" />
            </div>
            <input
              type="text"
              className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block w-full pl-10 p-2.5"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          {/* Status filter */}
          <select
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg block p-2.5"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="All">All Statuses</option>
            <option value="Order Placed">Order Placed</option>
            <option value="Packing">Packing</option>
            <option value="Shipped">Shipped</option>
            <option value="Out for Delivery">Out for Delivery</option>
            <option value="Delivered">Delivered</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6a5acd]"></div>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <FiPackage className="w-12 h-12 mb-3" />
          <p className="text-xl">No orders found</p>
          <p className="text-sm mt-2">Try changing your search or filter criteria</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid gap-4">
            {filteredOrders.map((order) => (
              <div
                key={order._id}
                className="border border-gray-200 rounded-lg overflow-hidden bg-white transition-all hover:border-[#6a5acd] hover:shadow-md"
              >
                {/* Order Header */}
                <div 
                  className="px-6 py-4 bg-gray-50 flex flex-col md:flex-row md:items-center justify-between cursor-pointer"
                  onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}
                >
                  <div className="flex flex-col mb-3 md:mb-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[#6a5acd]">#{order.orderNumber || order._id}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                    </div>
                    <span className="text-sm text-gray-600 mt-1">
                      {formatDate(order.date)} · {currency}{order.amount}
                    </span>
                  </div>
                  
                  <div className="flex items-center">
                    <span className="text-sm text-gray-600 mr-3">{order.address.firstName} {order.address.lastName}</span>
                    {expandedOrder === order._id ? (
                      <FiChevronDown className="text-gray-500" />
                    ) : (
                      <FiChevronRight className="text-gray-500" />
                    )}
                  </div>
                </div>
                
                {/* Order Details (expanded view) */}
                {expandedOrder === order._id && (
                  <div className="p-6 border-t border-gray-200">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
                      {/* Order Items */}
                      <div className="order-2 lg:order-1">
                        <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                          <FiPackage className="mr-2" /> Order Items
                        </h3>
                        
                        <div className="space-y-4 mt-4">
                          {order.items.map((item, idx) => (
                            <div key={idx} className="flex border border-gray-100 rounded-lg p-4 hover:bg-gray-50">
                              {/* Product Image */}
                              <div className="w-20 h-20 rounded-md overflow-hidden bg-gray-100 flex-shrink-0">
                                {item.image ? (
                                  <img 
                                    src={Array.isArray(item.image) ? item.image[0] : item.image} 
                                    alt={item.name || 'Product image'} 
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-gray-200">
                                    <FiPackage className="text-gray-400 w-8 h-8" />
                                  </div>
                                )}
                              </div>
                              
                              {/* Product Info */}
                              <div className="ml-4 flex-grow">
                                <h4 className="font-medium text-gray-900">{item.name || 'Unknown Product'}</h4>
                                {item.brand && <p className="text-sm text-gray-500">{item.brand}</p>}
                                <div className="flex items-center mt-2 text-sm text-gray-700">
                                  <div className="flex-grow">
                                    <p>
                                      Size: <span className="font-medium">{item.size}</span>
                                    </p>
                                    <p className="mt-1">
                                      Quantity: <span className="font-medium">{item.quantity}</span>
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-[#6a5acd] font-medium">
                                      {currency}{item.price ? (item.price * item.quantity).toFixed(2) : 'N/A'}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        {/* Order Summary */}
                        <div className="mt-6 border-t border-gray-200 pt-4">
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-600">Subtotal</span>
                            <span className="font-medium">{currency}{order.subtotal || (order.amount - order.delivery_fee) || 0}</span>
                          </div>
                          <div className="flex justify-between text-sm mb-2">
                            <span className="text-gray-600">Shipping</span>
                            <span className="font-medium">{currency}{order.delivery_fee || 0}</span>
                          </div>
                          <div className="flex justify-between text-base font-medium mt-3 pt-3 border-t border-gray-100">
                            <span>Total</span>
                            <span className="text-[#6a5acd]">{currency}{order.amount}</span>
                          </div>
                        </div>
                 </div>
                      
                      {/* Customer and Order Information */}
                      <div className="order-1 lg:order-2">
                        <div className="bg-gray-50 rounded-lg p-5">
                          {/* Customer Information */}
                          <h3 className="font-medium text-gray-900 mb-3 flex items-center">
                            <FiUser className="mr-2" /> Customer Information
                          </h3>
                          <p className="text-gray-800 font-medium">
                            {order.address.firstName} {order.address.lastName}
                          </p>
                          <p className="text-gray-600 text-sm mt-1">{order.address.email}</p>
                          <p className="text-gray-600 text-sm mt-1 flex items-center">
                            <FiPhone className="w-4 h-4 mr-1" /> {order.address.phone}
                          </p>
                          
                          {/* Shipping Address */}
                          <h3 className="font-medium text-gray-900 mt-5 mb-3 flex items-center">
                            <FiMapPin className="mr-2" /> Shipping Address
                          </h3>
                          <p className="text-gray-600 text-sm">
                            {order.address.street}<br />
                            {order.address.city}, {order.address.state} {order.address.zipcode}<br />
                            {order.address.country}
                          </p>
                          
                          {/* Order Information */}
                          <h3 className="font-medium text-gray-900 mt-5 mb-3 flex items-center">
                            <FiInfo className="mr-2" /> Payment Information
                          </h3>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                 <div>
                              <p className="text-gray-500">Method</p>
                              <p className="font-medium">{order.paymentMethod}</p>
               </div>
               <div>
                              <p className="text-gray-500">Status</p>
                              <p className="font-medium">{order.payment ? "Paid" : "Unpaid"}</p>
                            </div>
                            <div className="mt-2">
                              <p className="text-gray-500">Date</p>
                              <p className="font-medium">{formatDate(order.date)}</p>
                            </div>
               </div>
                          
                          {/* Order Status */}
                          <h3 className="font-medium text-gray-900 mt-5 mb-3 flex items-center">
                            <FiTag className="mr-2" /> Order Status
                          </h3>
                          <select
                            value={order.status}
                            onChange={(event) => statusHandler(event, order._id)}
                            className="bg-white border border-gray-300 text-gray-900 text-sm rounded-lg block w-full p-2.5 focus:ring-[#6a5acd] focus:border-[#6a5acd]"
                          >
                 <option value="Order Placed">Order Placed</option>
                 <option value="Packing">Packing</option>
                 <option value="Shipped">Shipped</option>
                 <option value="Out for Delivery">Out for Delivery</option>
                 <option value="Delivered">Delivered</option>
               </select>
             </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
       </div>
     </div>
      )}
    </div>
  );
};
 
export default Orders;