import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { backendUrl, currency } from '../App';
import { toast } from 'react-toastify';
import { 
  FiPackage, 
  FiTruck, 
  FiRefreshCw, 
  FiUser, 
  FiCalendar, 
  FiCreditCard, 
  FiMapPin,
  FiFilter,
  FiInfo,
  FiChevronDown,
  FiChevronUp,
  FiShoppingBag
} from 'react-icons/fi';

const Orders = ({ token }) => {
  const [orderData, setOrderData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('All');
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [productDetails, setProductDetails] = useState({});

  // Fetch all orders
  const fetchAllOrders = async () => {
    if (!token) return null;
    setIsLoading(true);

    try {
      const response = await axios.post(backendUrl + '/api/order/list', {}, { headers: { token } });
      if (response.data.success) {
        const orders = response.data.orders.reverse();
        setOrderData(orders);
        
        // Extract all product IDs from orders
        const productIds = new Set();
        orders.forEach(order => {
          if (order.items && Array.isArray(order.items)) {
            order.items.forEach(item => {
              if (item.productId) {
                productIds.add(item.productId);
              }
            });
          }
        });
        
        if (productIds.size > 0) {
          await fetchProductDetails(Array.from(productIds));
        }
      } else {
        toast.error(response.data.message || 'Failed to fetch orders');
      }
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error(error.message || 'An error occurred while fetching orders');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch details for all products
  const fetchProductDetails = async (productIds) => {
    if (!productIds || productIds.length === 0) return;
    
    try {
      const details = {};
      
      // Fetch each product's details
      for (const id of productIds) {
        try {
          const response = await axios.get(`${backendUrl}/api/product/${id}`);
          if (response.data.success && response.data.product) {
            details[id] = response.data.product;
          } else {
            console.warn(`No product data found for ID: ${id}`);
          }
        } catch (err) {
          console.error(`Error fetching product ${id}:`, err);
        }
      }
      
      setProductDetails(details);
    } catch (error) {
      console.error('Error fetching product details:', error);
    }
  };

  // Update order status
  const updateOrderStatus = async (orderId, status) => {
    try {
      const response = await axios.post(
        backendUrl + '/api/order/status', 
        { orderId, status }, 
        { headers: { token } }
      );
      
      if (response.data.success) {
        await fetchAllOrders();
        toast.success('Order status updated successfully');
      } else {
        toast.error(response.data.message || 'Failed to update order status');
      }
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error(error.message || 'An error occurred while updating order status');
    }
  };

  // Get product info by item
  const getProductInfo = (item) => {
    // If we have product details for this item
    if (item.productId && productDetails[item.productId]) {
      const product = productDetails[item.productId];
      return {
        id: item.productId,
        name: product.name || 'Product',
        price: product.price || item.price || 0,
        image: product.image || [],
        brand: product.brand || '',
        variants: product.variants || []
      };
    }
    
    // Fallback if no product details found
    return {
      id: item.productId || '',
      name: item.name || 'Product',
      price: item.price || 0,
      image: item.image || [],
      brand: item.brand || '',
      variants: item.variants || []
    };
  };

  // Calculate item total price
  const calculateItemTotal = (item) => {
    const quantity = item.quantity || 1;
    const price = item.price || 
      (item.productId && productDetails[item.productId] ? 
        productDetails[item.productId].price : 0);
    
    return price * quantity;
  };

  // Calculate order subtotal
  const calculateSubtotal = (items) => {
    if (!items || !Array.isArray(items)) return 0;
    
    return items.reduce((total, item) => {
      return total + calculateItemTotal(item);
    }, 0);
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch(status) {
      case 'Order Placed':
        return <FiShoppingBag className="w-4 h-4" />;
      case 'Packing':
        return <FiPackage className="w-4 h-4" />;
      case 'Shipped':
        return <FiTruck className="w-4 h-4" />;
      case 'Out for Delivery':
        return <FiTruck className="w-4 h-4" />;
      case 'Delivered':
        return <FiRefreshCw className="w-4 h-4" />;
      default:
        return <FiShoppingBag className="w-4 h-4" />;
    }
  };

  // Get status color
  const getStatusColor = (status) => {
    switch(status) {
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

  // Filter orders by status
  const getFilteredOrders = () => {
    if (filterStatus === 'All') return orderData;
    return orderData.filter(order => order.status === filterStatus);
  };

  // Toggle order details expand/collapse
  const toggleOrderDetails = (orderId) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  // Format date
  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  // Get image URL from product
  const getProductImage = (productInfo) => {
    if (!productInfo.image) return null;
    
    if (Array.isArray(productInfo.image) && productInfo.image.length > 0) {
      return productInfo.image[0];
    }
    
    if (typeof productInfo.image === 'string') {
      return productInfo.image;
    }
    
    return null;
  };

  // Load orders on component mount
  useEffect(() => {
    if (token) {
      fetchAllOrders();
    }
  }, [token]);

  return (
    <div className="font-michroma pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-gray-800">Orders</h1>
        
        <div className="flex items-center gap-2">
          <button
            onClick={fetchAllOrders}
            className="flex items-center gap-1 px-4 py-2 bg-[#6a5acd] text-white rounded-md hover:bg-[#5a4cbb] transition-colors"
          >
            <FiRefreshCw className="w-4 h-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Status filters */}
      <div className="mb-6 overflow-x-auto">
        <div className="flex items-center gap-2 pb-2">
          <FiFilter className="text-gray-500" />
          <span className="text-sm font-medium text-gray-700">Filter by Status:</span>
        </div>
        <div className="flex space-x-2">
          {['All', 'Order Placed', 'Packing', 'Shipped', 'Out for Delivery', 'Delivered'].map((status) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap transition-colors ${
                filterStatus === status
                  ? 'bg-[#6a5acd] text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#6a5acd]"></div>
        </div>
      ) : getFilteredOrders().length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm">
          <FiInfo className="w-12 h-12 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">No orders found</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {/* Orders list */}
          {getFilteredOrders().map((order, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm overflow-hidden">
              {/* Order header */}
              <div className="p-5 border-b border-gray-100">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                  <div className="flex items-center">
                    <div className="bg-[#f5f3ff] p-2.5 rounded-md mr-3">
                      <FiPackage className="text-[#6a5acd] w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-800">Order #{order._id.substring(0, 8)}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <FiCalendar className="w-3.5 h-3.5" />
                        <span>{formatDate(order.date)}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center">
                    <span className={`px-3 py-1 rounded-full text-xs flex items-center gap-1 ${getStatusColor(order.status)}`}>
                      {getStatusIcon(order.status)}
                      {order.status}
                    </span>
                  </div>
                </div>

                {/* Customer, shipping and payment info */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Customer Info */}
                  <div className="bg-gray-50 rounded-md p-3">
                    <h4 className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                      <FiUser className="w-3 h-3" /> Customer Details
                    </h4>
                    <p className="font-medium text-sm">{order.address.firstName} {order.address.lastName}</p>
                    <p className="text-sm text-gray-600">{order.address.phone}</p>
                  </div>

                  {/* Shipping Info */}
                  <div className="bg-gray-50 rounded-md p-3">
                    <h4 className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                      <FiMapPin className="w-3 h-3" /> Shipping Address
                    </h4>
                    <p className="text-sm text-gray-600">
                      {order.address.street}, {order.address.state}, {order.address.country}, {order.address.zipcode}
                    </p>
                  </div>

                  {/* Payment Info */}
                  <div className="bg-gray-50 rounded-md p-3">
                    <h4 className="text-xs text-gray-500 flex items-center gap-1 mb-2">
                      <FiCreditCard className="w-3 h-3" /> Payment Details
                    </h4>
                    <p className="text-sm flex justify-between">
                      <span>Method:</span> 
                      <span className="font-medium">{order.paymentMethod}</span>
                    </p>
                    <p className="text-sm flex justify-between">
                      <span>Amount:</span> 
                      <span className="font-medium text-[#6a5acd]">{currency} {order.amount}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Order items section */}
              <div className="p-5">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-sm">Order Items ({order.items.length})</h4>
                  <button 
                    onClick={() => toggleOrderDetails(order._id)}
                    className="flex items-center gap-1 text-xs text-[#6a5acd] hover:underline focus:outline-none"
                  >
                    {expandedOrderId === order._id ? (
                      <>
                        <FiChevronUp className="w-4 h-4" />
                        <span>Hide Details</span>
                      </>
                    ) : (
                      <>
                        <FiChevronDown className="w-4 h-4" />
                        <span>Show Details</span>
                      </>
                    )}
                  </button>
                </div>
                
                {/* Order items summary (always visible) */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 p-4 bg-gray-50 rounded-md">
                  <div className="flex -space-x-2">
                    {order.items.slice(0, 3).map((item, i) => {
                      const productInfo = getProductInfo(item);
                      const imageUrl = getProductImage(productInfo);
                      
                      return (
                        <div key={i} className="w-10 h-10 rounded-full border-2 border-white overflow-hidden">
                          {imageUrl ? (
                            <img 
                              src={imageUrl} 
                              alt={productInfo.name} 
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '';
                                e.target.parentNode.innerHTML = `<div class="w-full h-full bg-gray-200 flex items-center justify-center"><svg class="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg></div>`;
                              }}
                            />
                          ) : (
                            <div className="w-full h-full bg-gray-200 flex items-center justify-center text-xs">
                              <FiPackage className="w-4 h-4 text-gray-400" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {order.items.length > 3 && (
                      <div className="w-10 h-10 rounded-full bg-[#f5f3ff] border-2 border-white flex items-center justify-center text-xs font-medium text-[#6a5acd]">
                        +{order.items.length - 3}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 flex-grow justify-between">
                    <div>
                      <p className="text-sm font-medium">{order.items.length} {order.items.length === 1 ? 'item' : 'items'}</p>
                      <p className="text-xs text-gray-500">Ordered on {formatDate(order.date)}</p>
                    </div>
                    <p className="text-sm font-medium">Total: {currency} {order.amount}</p>
                  </div>
                </div>
                
                {/* Expanded order details */}
                {expandedOrderId === order._id && (
                  <div className="mt-3 mb-4">
                    <div className="bg-gray-50 rounded-md overflow-hidden">
                      {/* Header */}
                      <div className="grid grid-cols-12 gap-2 p-3 bg-gray-100 text-xs font-medium text-gray-600">
                        <div className="col-span-5">Product</div>
                        <div className="col-span-3">Variant</div>
                        <div className="col-span-1 text-center">Qty</div>
                        <div className="col-span-3 text-right">Price</div>
                      </div>
                      
                      {/* Items */}
                      {order.items.map((item, itemIndex) => {
                        const productInfo = getProductInfo(item);
                        const imageUrl = getProductImage(productInfo);
                        
                        return (
                          <div 
                            key={itemIndex} 
                            className={`grid grid-cols-12 gap-3 p-4 items-center ${
                              itemIndex !== order.items.length - 1 ? 'border-b border-gray-100' : ''
                            }`}
                          >
                            {/* Product with Image and Title */}
                            <div className="col-span-5 flex items-center gap-3">
                              <div className="flex-shrink-0 w-14 h-14 bg-white rounded-md border border-gray-200 overflow-hidden">
                                {imageUrl ? (
                                  <img 
                                    src={imageUrl} 
                                    alt={productInfo.name} 
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                      e.target.onerror = null;
                                      e.target.src = '';
                                      e.target.parentNode.innerHTML = `<div class="w-full h-full flex items-center justify-center"><svg class="w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path></svg></div>`;
                                    }}
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <FiPackage className="w-5 h-5 text-gray-300" />
                                  </div>
                                )}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{productInfo.name}</p>
                                {productInfo.brand && <p className="text-xs text-gray-500">{productInfo.brand}</p>}
                              </div>
                            </div>
                            
                            {/* Variant */}
                            <div className="col-span-3">
                              {item.variant ? (
                                <div className="flex flex-col space-y-1">
                                  {Object.entries(item.variant).map(([key, value], i) => (
                                    <div key={i} className="flex items-center space-x-1">
                                      <span className="text-xs text-gray-500 capitalize">{key}:</span>
                                      <span className="text-xs font-medium bg-[#f5f3ff] text-[#6a5acd] px-1.5 py-0.5 rounded">{value}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : item.size ? (
                                <div className="inline-flex items-center px-2 py-1 bg-[#f5f3ff] rounded-md">
                                  <span className="text-xs text-[#6a5acd] font-medium">{item.size}</span>
                                </div>
                              ) : (
                                <span className="text-xs text-gray-500">-</span>
                              )}
                            </div>
                            
                            {/* Quantity */}
                            <div className="col-span-1 text-center">
                              <div className="inline-flex items-center justify-center w-8 h-8 bg-[#f5f3ff] border border-[#e9e3ff] rounded-md">
                                <span className="text-sm font-medium text-[#6a5acd]">{item.quantity || 1}</span>
                              </div>
                            </div>
                            
                            {/* Price */}
                            <div className="col-span-3 text-right">
                              <p className="font-medium text-sm text-gray-800">
                                {currency} {calculateItemTotal(item).toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-500">
                                {currency} {(item.price || productInfo.price).toFixed(2)} each
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Order Summary */}
                      <div className="p-4 bg-white border-t border-gray-200">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Subtotal:</span>
                          <span className="font-medium">
                            {currency} {calculateSubtotal(order.items).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mt-1">
                          <span className="text-gray-600">Shipping:</span>
                          <span className="font-medium">
                            {currency} 3.00
                          </span>
                        </div>
                        <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t border-gray-100">
                          <span>Total:</span>
                          <span className="text-[#6a5acd]">
                            {currency} {(calculateSubtotal(order.items) + 3).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Status update */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-3 border-t border-gray-100">
                  <p className="text-sm font-medium">Update Status:</p>
                  <select 
                    value={order.status} 
                    onChange={(e) => updateOrderStatus(order._id, e.target.value)} 
                    className='px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent'
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
          ))}
        </div>
      )}
    </div>
  );
};

export default Orders;