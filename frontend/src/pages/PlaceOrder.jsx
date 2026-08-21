import { useContext, useRef, useState } from 'react'
import { ShopContext } from '../context/shopContext';
import { toast } from '../lib/toast';
import { motion } from 'framer-motion';
import { FiShoppingBag, FiCreditCard, FiHome, FiCheck, FiPackage } from 'react-icons/fi';
import CartTotal from '../components/CartTotal'
import whishLogo from '../assets/all/whishLogo.png';
import BackButton from '../components/BackButton';
import * as ordersApi from '../api/orders';
import { ApiError } from '../api/client';
import { createCheckoutAttempt } from '../lib/idempotency';
import Seo from '../components/Seo';

const PlaceOrder = () => {

  const [method, setMethod] = useState('cod');
  const { navigate, token, cartLines, setCartItems } = useContext(ShopContext);
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

  /**
   * The idempotency key this checkout attempt is using (DB-012).
   *
   * A ref, because it must survive re-renders without causing one, and because
   * the whole point is that pressing "Place Order" a second time after an
   * uncertain response sends the *same* key. `isSubmitting` was the only guard
   * before, and it protects against neither a retry after a timeout nor the
   * reload a customer performs when they cannot tell whether the order went
   * through — both of which used to create a second order and decrement stock
   * twice.
   */
  const attempt = useRef(createCheckoutAttempt());

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
      const ambiguous = [];

      // The line names its own combination (DB-003). This used to walk the
      // legacy `{ productId: { key: quantity } }` map and *reconstruct* the
      // options with `getVariantEntries(product).find(c => c.legacyKey === key)`
      // — the first match — so for a catalog containing
      // `["16-inch","16"] × ["1TB","inch-1TB"]` it sent the wrong combination's
      // options as the lossless identity, walking straight past the server's
      // own refusal to guess. Nothing is reconstructed now: what the customer
      // selected is what is submitted.
      for (const line of cartLines) {
        if (line.quantity <= 0) continue;

        if (!line.variantOptions || line.unresolvable) {
          ambiguous.push(line);
          continue;
        }

        orderItems.push({
          productId: String(line.productId),
          // The legacy key rides along so a server that has not been redeployed
          // resolves it the way it always did.
          size: line.variantKey ?? '',
          quantity: line.quantity,
          variantOptions: line.variantOptions,
        });
      }

      if (ambiguous.length > 0) {
        toast.error('An option in your cart cannot be identified. Please remove it and choose again.');
        setIsSubmitting(false);
        return;
      }

      // Check if we have items to order
      if (orderItems.length === 0) {
        toast.error('Your cart is empty');
        setIsSubmitting(false);
        return;
      }

      // SEC-002 — the browser no longer sends any pricing figure.
      //
      // This used to carry `amount`, `subtotal` and `delivery_fee`, computed
      // here and written down by the server verbatim, so an order could be
      // placed for any total at all with one edit in devtools. The server now
      // resolves every unit price from the database and applies the delivery
      // fee itself; sending numbers it will ignore would only imply they still
      // matter. `CartTotal` continues to display the same figures — that is
      // presentation, and it is checked against the server's answer when the
      // order comes back.
      let orderData = {
        // userId is derived from the verified token by the auth middleware.
        address: formData,
        items: orderItems,
        paymentMethod: method.toUpperCase(),
      }

      // SEC-016 — `console.log('Token in headers:', token)` ran on every
      // checkout, putting the session token in devtools, in any
      // console-capturing error reporter, and in every support screenshot.

      // The same key for every retry of this attempt; a new one only when the
      // cart, the address or the payment method actually changes.
      const idempotencyKey = attempt.current.keyFor(orderData);

      try {
        await ordersApi.placeOrder({ ...orderData, authenticated: Boolean(token), idempotencyKey });

        // The attempt is over. A customer who deliberately orders the same
        // things again is placing a new order, not retrying this one.
        attempt.current.settle();

        // FE-002 — the cart is cleared directly, for everyone.
        //
        // This used to read `if (token && typeof setCartItems === 'function')`.
        // The context never provided `setCartItems`, so for a *signed-in*
        // customer that guard was false and the else branch ran instead —
        // removing the guest cart from `localStorage`, which a signed-in
        // customer does not have, and leaving the cart on screen exactly as it
        // was after a successful order. A guard that turns a crash into wrong
        // behaviour is worse than the crash: the crash would have been noticed.
        setCartItems({});
        localStorage.removeItem('guestCart');

        toast.success('Order placed successfully!');

        // FE-031 — router navigation. `window.location.href` discarded the whole
        // application and reloaded it from the network, throwing away the
        // context, the catalog and every cache, to move between two routes the
        // router already owns.
        setTimeout(() => navigate(token ? '/orders' : '/'), 1500);
      } catch (error) {
        console.error('Order error:', error);
        toast.error(error instanceof ApiError ? error.message : 'Order placement failed');
      } finally {
        setIsSubmitting(false);
      }
    } catch (error) {
      console.log(error);
      toast.error(error.message);
      setIsSubmitting(false);
    }
  }

  return (

      <div className="min-h-screen bg-gradient-to-b from-white to-gray-50 px-4 sm:px-6 lg:px-8 py-12 pt-[80px] md:pt-[100px]">

        <Seo title="Checkout" description="Enter your delivery details and choose a payment method." />
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
                  <label htmlFor="checkout-firstName" className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                  <input 
                    id="checkout-firstName"
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
                  <label htmlFor="checkout-lastName" className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                  <input 
                    id="checkout-lastName"
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
                <label htmlFor="checkout-email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input 
                  id="checkout-email"
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
                <label htmlFor="checkout-street" className="block text-sm font-medium text-gray-700 mb-1">Street Address</label>
                <input 
                  id="checkout-street"
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
                  <label htmlFor="checkout-city" className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input 
                    id="checkout-city"
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
                  <label htmlFor="checkout-state" className="block text-sm font-medium text-gray-700 mb-1">State/Province</label>
                  <input 
                    id="checkout-state"
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
                  <label htmlFor="checkout-zipcode" className="block text-sm font-medium text-gray-700 mb-1">Zip/Postal Code</label>
                  <input 
                    id="checkout-zipcode"
                    required 
                    onChange={onChangeHandler} 
                    name='zipcode'
                    value={formData.zipcode}
                    className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent'
                    /* FE-032 — `type="number"` on a postal code. A number input
                       drops leading zeros, so Beirut's "2022" survives but a
                       code like "01234" is submitted as "1234"; it also refuses
                       every non-digit, which excludes most of the world's postal
                       formats. `inputMode` keeps the numeric keypad on a phone
                       without making the value a number. */
                    type="text"
                    inputMode="numeric"
                    autoComplete="postal-code"
                    placeholder='Zip/Postal Code' 
                  />
                </div>
                <div>
                  <label htmlFor="checkout-country" className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                  <input 
                    id="checkout-country"
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
                <label htmlFor="checkout-phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input 
                  id="checkout-phone"
                  required 
                  onChange={onChangeHandler} 
                  name='phone'
                  value={formData.phone}
                  className='w-full border border-gray-300 rounded-lg py-2 px-4 focus:outline-none focus:ring-2 focus:ring-[#6a5acd] focus:border-transparent'
                  /* FE-032 — the shop is Lebanon-based and every seeded address
                     is "+961 71 000 000". A `type="number"` input cannot hold a
                     "+", a space or a hyphen, so the country code — the part
                     that makes an international number dialable — could not be
                     typed at all. */
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder='Phone Number' 
                />
              </div>
            </div>
            
            {/* Payment Method Section */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              {/* A11Y-005 — these were two `<div onClick>` acting as radio
                  buttons: not reachable by Tab, not operable by Space, not
                  grouped, with no `aria-checked`. **Checkout could not be
                  completed by keyboard**, which is the one place on the site a
                  dead end costs an order.

                  They are a real `<fieldset>` of `<input type="radio">` now,
                  so arrow keys move between them, Space selects, and the group
                  announces itself. The radio itself is visually hidden and the
                  existing custom dot is drawn from `method`, so the control
                  looks and behaves exactly as it did for a mouse user — the
                  same border, the same fill, the same hover. `peer-focus`
                  gives the keyboard user the focus ring the div never could. */}
              <fieldset className="border-0 p-0 m-0">
                <legend className="flex items-center gap-3 mb-6 text-xl font-bold text-gray-900">
                  <FiCreditCard aria-hidden="true" className="w-5 h-5 text-[#6a5acd]" />
                  Payment Method
                </legend>

                <div className="space-y-3">
                  {[
                    {
                      value: 'whish',
                      label: 'Whish Payment',
                      icon: <img className="h-6" src={whishLogo} alt="" width={54} height={19} />,
                    },
                    {
                      value: 'cod',
                      label: 'Cash on Delivery',
                      icon: <FiPackage aria-hidden="true" className="w-5 h-5 text-[#6a5acd]" />,
                    },
                  ].map((option) => (
                    <label
                      key={option.value}
                      htmlFor={`payment-${option.value}`}
                      className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${
                        method === option.value
                          ? 'border-[#6a5acd] bg-gray-50'
                          : 'border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        id={`payment-${option.value}`}
                        type="radio"
                        name="paymentMethod"
                        value={option.value}
                        checked={method === option.value}
                        onChange={() => setMethod(option.value)}
                        className="sr-only peer"
                      />
                      <span
                        aria-hidden="true"
                        className={`w-5 h-5 rounded-full border flex items-center justify-center peer-focus-visible:ring-2 peer-focus-visible:ring-[#6a5acd] peer-focus-visible:ring-offset-2 ${
                          method === option.value ? 'border-[#6a5acd]' : 'border-gray-300'
                        }`}
                      >
                        {method === option.value && <span className="w-3 h-3 bg-[#6a5acd] rounded-full" />}
                      </span>
                      <span className="ml-4 flex items-center">
                        {option.icon}
                        <span className="ml-2 text-sm font-medium text-gray-700">{option.label}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
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