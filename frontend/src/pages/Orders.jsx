import { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/shopContext'
import * as ordersApi from '../api/orders'
import { ApiError } from '../api/client'
import { firstImage } from '../lib/catalog'
import { toast } from '../lib/toast'
import { motion } from 'framer-motion'
import { FiPackage } from 'react-icons/fi'
import DemoNotice from '../components/DemoNotice'
import Panel from '../components/Panel'
import Seo from '../components/Seo';

/**
 * How an order status is written on the storefront.
 *
 * `backend/models/orderModel.js` stores one of five values — `Order Placed`,
 * `Packing`, `Shipped`, `Out for Delivery`, `Delivered` — and only an admin can
 * advance one. Nothing else in the system ever will, because there is no
 * warehouse and no courier, so in practice every order sits at `Order Placed`
 * for ever underneath what used to be a five-stage delivery ladder in blue,
 * yellow, purple, indigo and green.
 *
 * The enum is a data contract shared with the admin console; it is not this
 * page's to change. What *is* this page's to change is the claim it makes about
 * it. "Shipped" states that a parcel is in transit. "Marked shipped" states that
 * a row in a database says so, which is the true and complete extent of it.
 *
 * The colour ladder is gone with it. One neutral marker for every recorded
 * state, because a progression of colours is itself a promise that the
 * progression happens.
 */
const STATUS_LABELS = {
  'Order Placed': 'Recorded',
  Packing: 'Marked packing',
  Shipped: 'Marked shipped',
  'Out for Delivery': 'Marked out for delivery',
  Delivered: 'Marked delivered',
}

const statusLabel = (status) => STATUS_LABELS[status] ?? status ?? 'Recorded'

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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.06 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
    },
  };

  return (
    <div className="min-h-screen bg-paper px-4 pb-24 text-ink sm:px-[5vw] md:px-[7vw] lg:px-[9vw]">
      <Seo title="Your Orders" description="The orders recorded against your Netronix account." />

      <motion.div
        className="mx-auto max-w-[1200px]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="pt-[104px] md:pt-[132px]">
          <div className="flex items-center gap-3">
            <span className="font-michroma text-[9px] uppercase tracking-[0.22em] text-statepurp md:text-[10px]">
              Netronix / Orders
            </span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
            <h1
              className="font-michroma uppercase leading-[0.95] tracking-tight text-ink"
              style={{ fontSize: 'clamp(2rem, 6vw, 4rem)' }}
            >
              My Orders
            </h1>

            {/* This was labelled `Track Order`, once per row, and its handler
                was `loadOrderData` — it re-fetched the list. No tracking number,
                no carrier, no timeline: a refresh wearing a courier's coat, and
                the same defect class as the dead controls taken off the product
                card and Sign-in.

                It is now named after what it does, and there is one of it rather
                than one per line, because every copy did the same thing to the
                whole page. */}
            <button
              type="button"
              onClick={loadOrderData}
              disabled={isLoading}
              className="border border-rule px-6 py-3 font-michroma text-[9px] uppercase tracking-[0.16em] text-ink transition-colors duration-300 hover:border-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-40 disabled:hover:bg-transparent"
            >
              {isLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          <DemoNotice className="mt-8 max-w-[68ch]" />
        </header>

        <div className="pt-10">
          {isLoading ? (
            <div role="status" aria-live="polite">
              <div aria-hidden="true" className="divide-y divide-rule border-y border-rule">
                {[0, 1].map((row) => (
                  <div key={row} className="flex gap-5 py-6">
                    <div className="h-24 w-24 animate-plate-sheen bg-wash" />
                    <div className="flex-1 pt-2">
                      <div className="h-3 w-2/5 bg-wash" />
                      <div className="mt-3 h-2 w-1/4 bg-wash" />
                      <div className="mt-6 h-2 w-1/3 bg-wash" />
                    </div>
                  </div>
                ))}
              </div>
              <span className="sr-only">Loading your orders…</span>
            </div>
          ) : orderData.length === 0 ? (
            <Panel
              heading="No orders found"
              body="You haven't placed any orders yet."
              action={
                <button
                  type="button"
                  onClick={() => navigate('/collections/all')}
                  className="mt-8 border border-ink bg-ink px-8 py-3 font-michroma text-[9px] uppercase tracking-[0.16em] text-paper transition-colors duration-300 hover:border-statepurp hover:bg-statepurp"
                >
                  Start Shopping
                </button>
              }
            />
          ) : (
            <motion.ul
              className="divide-y divide-rule border-y border-rule"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {orderData.map((item, index) => (
                <motion.li
                  key={`${item.orderId}-${index}`}
                  className="flex flex-col gap-5 py-7 md:flex-row md:items-start md:gap-8"
                  variants={itemVariants}
                >
                  {/* The line's own image snapshot, falling back to the glyph
                      rather than to a broken `<img>` (FE-017). */}
                  <div className="h-24 w-24 shrink-0 overflow-hidden bg-white md:h-28 md:w-28">
                    {firstImage(item.image) ? (
                      <img
                        className="h-full w-full object-cover"
                        src={firstImage(item.image)}
                        alt={item.name || 'Product'}
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-wash">
                        <FiPackage className="h-8 w-8 text-ink-40" aria-hidden="true" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1">
                    <h2 className="text-base leading-snug text-ink md:text-lg">{item.name || 'Product'}</h2>

                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-60">
                      <span className="tnum">Order {getOrderDisplay(item)}</span>
                      <span aria-hidden="true" className="h-3 w-px bg-rule" />
                      <span className="tnum">{formatPrice(item.unitPriceMinor || 0)}</span>
                      <span aria-hidden="true" className="h-3 w-px bg-rule" />
                      <span className="tnum">Qty: {item.quantity || 1}</span>
                      {(item.variantLabel || item.variantKey || item.size) && (
                        <>
                          <span aria-hidden="true" className="h-3 w-px bg-rule" />
                          {/* ARCH-003 — the label the order itself carries,
                              rather than the hardcoded "Size:" prefix on a key
                              that may name any axis at all. */}
                          <span>{item.variantLabel || item.variantKey || item.size}</span>
                        </>
                      )}
                    </p>

                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-40">
                      <span className="tnum">
                        {item.date ? new Date(item.date).toLocaleDateString() : 'N/A'}
                      </span>
                      <span aria-hidden="true" className="h-3 w-px bg-rule" />
                      <span>{item.paymentMethod || 'N/A'}</span>
                    </p>

                    {item.reconstructed && (
                      <p
                        className="mt-3 border-l-2 border-rule pl-3 text-xs leading-relaxed text-ink-60"
                        title="This order predates order snapshots. Its price and name were reconstructed from the catalogue and are an approximation, not a record of what was charged."
                      >
                        <span className="font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40">
                          Reconstructed
                        </span>
                        <span className="mt-1 block">
                          Placed before this shop kept order snapshots. The name and price above
                          were read back from the catalog and are an approximation.
                        </span>
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 md:w-52 md:text-right">
                    <span className="font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40">
                      Status
                    </span>
                    <span className="mt-1.5 block text-sm text-ink">{statusLabel(item.status)}</span>
                  </div>
                </motion.li>
              ))}
            </motion.ul>
          )}
        </div>
      </motion.div>
    </div>
  )
}

export default Orders
