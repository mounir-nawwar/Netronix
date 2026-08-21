import { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/shopContext'
import * as ordersApi from '../api/orders'
import { ApiError } from '../api/client'
import { firstImage } from '../lib/catalog'
import { toast } from '../lib/toast'
import { motion } from 'framer-motion'
import { FiPackage, FiCreditCard, FiCalendar } from 'react-icons/fi'
import Seo from '../components/Seo';

const Orders = () => {

  // FE-021 — `/orders` is behind `RequireAuth` now, so this page is only ever
  // rendered for a signed-in customer. It used to be public, with
  // `if (!token) return null` inside a `try` whose `finally` cleared the loading
  // flag — so a logged-out visitor was shown "No orders found", which is a
  // statement about their account rather than their session, and it is false.
  const { token, products, formatPrice, getPriceMinor, navigate } = useContext(ShopContext)
  const [orderData, setOrderData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadOrderData = async () => {
    setIsLoading(true);
    try {
      const { items } = await ordersApi.listMyOrders();
      {
        let allOrdersItem = []
        items.map((order) => {
          order.items.map((item) => {
            // FE-017 / DB-005 — the spread order here was the bug.
            //
            // It used to be `{ ...item, ...productDetails }`, so today's
            // catalog name, price and image **overwrote** the line. Changing a
            // product's price rewrote every past order that contained it, and
            // deleting a product degraded the line to "Product" and "$0".
            //
            // The order is inverted: the catalog is the *fallback*, and the
            // snapshot the order actually carries wins. For an order placed
            // after the Phase 2 migration nothing is read from the catalog at
            // all — the API no longer even looks it up.
            const productDetails = products.find(p => p._id === item.productId) || {};

            const enrichedItem = {
              ...productDetails,
              ...item,
              status: order.status,
              payment: order.payment,
              paymentMethod: order.paymentMethod,
              date: order.date,
              orderId: order._id,
              orderNumber: order.orderNumber || order._id,
              // Exact integer minor units, preferring the snapshot and falling
              // back to the catalog only for a pre-migration line (DB-004).
              unitPriceMinor: item.unitPriceMinor
                ?? (item.unitPrice !== undefined ? Math.round(item.unitPrice * 100) : getPriceMinor(productDetails)),
              // A reconstructed line is an approximation, not a record. Say so.
              reconstructed: Boolean(item._reconstructed),
            };
            
            allOrdersItem.push(enrichedItem);
          })
        })
        setOrderData(allOrdersItem.reverse());
      }
    } catch (error) {
      console.error('Could not load your orders', error);
      toast.error(error instanceof ApiError ? error.message : 'Could not load your orders');
    } finally {
      setIsLoading(false);
    }
  }

  // Once per session, not once per catalog change. `products` used to be a
  // dependency because the page enriched each line from the catalog; after
  // DB-005 an order line is a self-contained snapshot and the catalog is only a
  // fallback for orders written before the migration, so re-fetching when the
  // catalog arrives just issued the same request twice.
  useEffect(() => {
    if (token) loadOrderData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // Add a function to display order number or ID
  const getOrderDisplay = (item) => {
    return item.orderNumber ? `#${item.orderNumber}` : `#${item.orderId}`;
  };

  // TEST-002 — a `getStatusIcon` helper used to sit here, fully written and
  // called by nothing: the status column renders `getStatusColor` badges
  // instead. Deleted rather than wired in, because deciding that order rows
  // should carry icons is a design change, not a lint fix.

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

        <Seo title="Your Orders" description="Track the status of your Netronix orders." />
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
            <p className="text-gray-600 mb-6">You haven&apos;t placed any orders yet.</p>
            <button 
              onClick={() => navigate('/collections/all')}
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
                      {firstImage(item.image) ? (
                        <img 
                          className="w-full h-full object-cover" 
                          src={firstImage(item.image)}
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
                          {formatPrice(item.unitPriceMinor || 0)}
                        </span>
                        <span className="inline-flex items-center bg-gray-100 rounded-full px-3 py-1">
                          Qty: {item.quantity || 1}
                        </span>
                        {(item.variantLabel || item.variantKey || item.size) && (
                          <span className="inline-flex items-center bg-gray-100 rounded-full px-3 py-1">
                            {/* ARCH-003 — the label the order itself carries,
                                rather than the hardcoded "Size:" prefix on a
                                key that may name any axis at all. */}
                            {item.variantLabel || item.variantKey || item.size}
                          </span>
                        )}
                        {item.reconstructed && (
                          <span
                            className="inline-flex items-center bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-3 py-1"
                            title="This order predates order snapshots. Its price and name were reconstructed from the catalogue and are an approximation, not a record of what was charged."
                          >
                            Reconstructed
                          </span>
                        )}
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