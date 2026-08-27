import { useContext, useEffect, useState } from 'react'
import { Link } from 'react-router-dom';
import { ShopContext } from '../context/shopContext';
import { lineIdOf } from '../lib/cartLines';
import { toast } from '../lib/toast';
import { motion, AnimatePresence } from 'framer-motion';
import { FiShoppingCart, FiTrash2, FiMinus, FiPlus, FiAlertCircle, FiArrowRight } from 'react-icons/fi';
import CartTotal from '../components/CartTotal';
import Panel from '../components/Panel';
import BackButton from '../components/BackButton';
import Seo from '../components/Seo';

const SOLID_BUTTON = 'border border-ink bg-ink px-8 py-3 font-michroma text-[9px] uppercase tracking-[0.16em] text-paper transition-colors duration-300 hover:border-statepurp hover:bg-statepurp'

// FE-012 — the cart said "empty" while it was still loading.
//
// It ran `setTimeout(() => setIsLoading(false), 300)` on every effect, whether
// or not the catalog had arrived, and the timeout was never cleared. Three
// hundred milliseconds is not a fact about anything: on a slow connection the
// timer won, `cartData` was still `[]` because the catalog had not landed, and a
// customer with a full cart was told their cart was empty and shown a "Start
// Shopping" button.
//
// Loading is not a timer. It is the state of the request, which the context now
// reports, and this page reads.
const Cart = () => {

  const {
    products, cartLines, catalogStatus, catalogError, reloadCatalog, updateQuantity, navigate,
    getVariantDisplayName, getPriceMinor, formatPrice, getUnpricedCartLines,
  } = useContext(ShopContext);

  const [cartData, setCartData] = useState([]);
  const [inventoryWarnings, setInventoryWarnings] = useState({});

  const isLoading = catalogStatus === 'loading';
  const hasFailed = catalogStatus === 'error';
  // FE-024 — lines the catalog cannot price. Counting them as zero is how a
  // cart quietly under-reports its own total.
  const unpricedLines = getUnpricedCartLines();

  useEffect(() => {
    if (products.length === 0) {
      setCartData([]);
      setInventoryWarnings({});
      return;
    }

    const tempData = [];
    const warnings = {};

    // One row per line the customer actually chose (DB-003). Iterating the
    // legacy `{ productId: { key: quantity } }` map collapsed two combinations
    // whose option values hyphen-join to the same string into one row, so the
    // cart could not show — or remove — the one that was overwritten.
    for (const line of cartLines) {
      if (line.quantity <= 0) continue;

      const id = lineIdOf(line);
      tempData.push({
        id,
        _id: String(line.productId),
        variantKey: line.variantKey,
        variantId: line.variantId,
        variantOptions: line.variantOptions,
        variantLabel: line.variantLabel,
        quantity: line.quantity,
        unresolvable: line.unresolvable,
        available: line.available,
      });

      // `null` is not zero. A line the catalog cannot identify — an ambiguous
      // hyphen join, or an option that was withdrawn — is a different problem
      // from "none left", and telling the customer "out of stock" about a
      // product that is in stock is both untrue and unactionable: re-adding the
      // same option reproduces it.
      if (line.unresolvable) {
        warnings[id] = { available: 0, requested: line.quantity, unidentifiable: true };
      } else if (line.quantity > (line.available ?? 0)) {
        warnings[id] = { available: line.available ?? 0, requested: line.quantity };
      }
    }

    setCartData(tempData);
    setInventoryWarnings(warnings);
  }, [cartLines, products]);

  // Check if a specific line has an inventory warning
  const hasInventoryWarning = (id) => inventoryWarnings[id] !== undefined;

  /** True when the catalog cannot say which combination this line names. */
  const isUnidentifiable = (id) => Boolean(inventoryWarnings[id]?.unidentifiable);

  /**
   * How to address one line.
   *
   * The canonical identity where the line has one, because two lines can share
   * a legacy key and addressing by key would then change whichever came first.
   */
  const lineRefOf = (item) => (item.variantId
    ? { variantId: item.variantId }
    : { variantKey: item.variantKey });

  // Handle quantity change with inventory check
  const handleQuantityChange = (item, newQuantity) => {
    const availableInventory = item.available ?? 0;

    if (newQuantity > availableInventory) {
      toast.error(`Only ${availableInventory} items available for this variant`);
      // Update to maximum available
      updateQuantity(item._id, lineRefOf(item), availableInventory);
    } else {
      updateQuantity(item._id, lineRefOf(item), newQuantity);
    }
  };

  // One entrance for the page, and a spring for lines arriving or leaving.
  // The chained `delay: 0.2` on the heading and `delay: 0.3` on the summary are
  // gone: a page that assembles itself over half a second is a page that looks
  // slow on a fast connection and broken on a slow one.
  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 26 } },
    exit: { opacity: 0, x: -16, transition: { duration: 0.2 } },
  };

  /**
   * The warnings a line carries, in the order they are shown.
   *
   * A list rather than a single string, because two of these are independently
   * true and both need saying: a line at zero stock usually *also* has a
   * quantity warning, and collapsing them to whichever matched first dropped
   * "Out of stock. Please remove this item." — which is the only one that tells
   * the customer the line can never be bought rather than merely reduced.
   *
   * Identity comes first and suppresses the stock notice: a line whose
   * combination cannot be resolved has no stock figure to be wrong about
   * (FE-024, DB-003).
   */
  const warningsFor = (item) => {
    if (isUnidentifiable(item.id)) {
      return ['This option cannot be identified any more. Please remove it and choose again.'];
    }

    const warnings = [];
    const available = item.available ?? 0;
    if (hasInventoryWarning(item.id)) {
      warnings.push(`Only ${available} item(s) in stock. Please adjust your quantity.`);
    }
    if (available === 0) warnings.push('Out of stock. Please remove this item.');
    return warnings;
  };

  const blocked = Object.keys(inventoryWarnings).length > 0;

  return (
    <div className="min-h-screen bg-paper px-4 pb-24 text-ink sm:px-[5vw] md:px-[7vw] lg:px-[9vw]">
      <Seo title="Your Cart" description="Review the items in your Netronix cart before checkout." />

      <div className="mx-auto max-w-[1200px]">
        <div className="pt-[104px] md:pt-[132px]">
          <div className="flex items-center gap-3">
            <BackButton showLabel={false} />
            <span className="font-michroma text-[9px] uppercase tracking-[0.22em] text-statepurp md:text-[10px]">
              Netronix / Bag
            </span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <h1
            className="mt-5 font-michroma uppercase leading-[0.95] tracking-tight text-ink"
            style={{ fontSize: 'clamp(2rem, 6vw, 4rem)' }}
          >
            Shopping Cart
          </h1>
        </div>

        <div className="pt-10">
          {isLoading ? (
            /* FE-012 — present synchronously on the first render. "Your cart is
               empty" is a claim about the cart; while the catalog is still in
               flight the page has no basis for making it. */
            <div role="status" aria-live="polite">
              <div aria-hidden="true" className="grid gap-4">
                {[0, 1].map((row) => (
                  <div key={row} className="flex gap-5 border-b border-rule pb-6">
                    <div className="h-24 w-24 animate-plate-sheen bg-wash" />
                    <div className="flex-1 pt-2">
                      <div className="h-3 w-2/5 bg-wash" />
                      <div className="mt-3 h-2 w-1/4 bg-wash" />
                      <div className="mt-6 h-8 w-28 bg-wash" />
                    </div>
                  </div>
                ))}
              </div>
              <span className="sr-only">Loading your cart…</span>
            </div>
          ) : hasFailed ? (
            <Panel
              role="alert"
              heading="We could not load your cart"
              body={catalogError || 'Please try again in a moment.'}
              action={
                <button type="button" onClick={reloadCatalog} className={`mt-8 ${SOLID_BUTTON}`}>
                  Try again
                </button>
              }
            />
          ) : cartData.length === 0 ? (
            <Panel
              heading="Your cart is empty"
              body="Add items to get started"
              action={
                <button
                  type="button"
                  onClick={() => navigate('/collections/all')}
                  className={`mt-8 ${SOLID_BUTTON}`}
                >
                  Start Shopping
                </button>
              }
            />
          ) : (
            <>
              {unpricedLines.length > 0 && (
                /* FE-024 — a line whose product the catalog cannot produce is not
                   worth zero, it is unknown. It used to be skipped silently, so
                   the total was simply wrong with nothing to show for it. */
                <p
                  className="mb-8 flex items-start gap-3 border-l-2 border-statepurp bg-wash px-4 py-3 text-sm text-ink-60"
                  role="alert"
                >
                  <FiAlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 flex-shrink-0 text-statepurp" />
                  <span>
                    {unpricedLines.length === 1 ? 'One item is' : `${unpricedLines.length} items are`} no longer
                    in the catalog, so {unpricedLines.length === 1 ? 'it is' : 'they are'} not included in the total below.
                  </span>
                </p>
              )}

              <div className="flex flex-col gap-12 lg:flex-row lg:gap-16">
                <div className="lg:w-[62%]">
                  <AnimatePresence initial={false}>
                    {cartData.map((item) => {
                      const productData = products.find((product) => product._id === item._id);
                      if (!productData) return null;

                      const availableInventory = item.available ?? 0;
                      // The line names its own combination, so the label is read
                      // from the options rather than reconstructed from the key.
                      const variantDisplay = item.variantLabel
                        || getVariantDisplayName(productData, item.variantKey);
                      const warnings = warningsFor(item);

                      return (
                        <motion.div
                          key={item.id}
                          layout
                          variants={itemVariants}
                          initial="hidden"
                          animate="visible"
                          exit="exit"
                          className="border-b border-rule py-7 first:pt-0"
                        >
                          <div className="flex gap-5">
                            <Link
                              to={`/product/${item._id}`}
                              className="h-24 w-24 flex-shrink-0 overflow-hidden bg-plate sm:h-28 sm:w-28"
                              aria-label={productData.name || 'Product'}
                            >
                              {productData.image?.[0] ? (
                                <img
                                  className="h-full w-full object-contain p-2"
                                  src={productData.image[0]}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                />
                              ) : (
                                <span className="flex h-full w-full items-center justify-center">
                                  <FiShoppingCart aria-hidden="true" className="h-8 w-8 text-ink-40" />
                                </span>
                              )}
                            </Link>

                            <div className="min-w-0 flex-grow">
                              <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                  {productData.brand && (
                                    <p className="font-michroma text-[9px] uppercase tracking-[0.18em] text-ink-40">
                                      {productData.brand}
                                    </p>
                                  )}
                                  <h3 className="mt-1.5 text-[15px] leading-snug text-ink">
                                    {productData.name || 'Product'}
                                  </h3>
                                  {/* ARCH-003 — `variantDisplay` already names its
                                      axes ("Storage: 1TB"), so the hardcoded
                                      "Size:" prefix rendered "Size: Storage: 1TB"
                                      and was simply wrong on any product whose
                                      axis is not called Size. */}
                                  <p className="mt-1.5 text-xs text-ink-60">{variantDisplay || 'One Size'}</p>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => updateQuantity(item._id, lineRefOf(item), 0)}
                                  className="flex-shrink-0 p-1 text-ink-40 transition-colors hover:text-ink"
                                  aria-label="Remove item"
                                >
                                  <FiTrash2 aria-hidden="true" className="h-4 w-4" />
                                </button>
                              </div>

                              <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                                <div className="flex items-center border border-rule">
                                  {/* A11Y-009 — axe reported these two as
                                      *critical* "Buttons must have discernible
                                      text": an icon-only stepper announced as
                                      "button", twice per line, with no way to
                                      tell which was which or what it acted on. */}
                                  <button
                                    type="button"
                                    onClick={() => handleQuantityChange(item, Math.max(1, item.quantity - 1))}
                                    aria-label={`Decrease the quantity of ${productData.name}`}
                                    disabled={item.quantity <= 1}
                                    className="flex h-10 w-10 items-center justify-center text-ink transition-colors hover:bg-wash disabled:cursor-not-allowed disabled:text-ink-40 disabled:hover:bg-transparent"
                                  >
                                    <FiMinus aria-hidden="true" className="h-3.5 w-3.5" />
                                  </button>
                                  <span className="tnum flex h-10 w-11 items-center justify-center border-x border-rule text-sm">
                                    {item.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleQuantityChange(item, item.quantity + 1)}
                                    aria-label={`Increase the quantity of ${productData.name}`}
                                    disabled={item.quantity >= availableInventory}
                                    className="flex h-10 w-10 items-center justify-center text-ink transition-colors hover:bg-wash disabled:cursor-not-allowed disabled:text-ink-40 disabled:hover:bg-transparent"
                                  >
                                    <FiPlus aria-hidden="true" className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                <p className="tnum text-[15px] text-ink">
                                  {formatPrice(getPriceMinor(productData) * item.quantity)}
                                  <span className="ml-2 text-xs text-ink-40">
                                    {formatPrice(getPriceMinor(productData))} each
                                  </span>
                                </p>
                              </div>

                              {warnings.map((warning) => (
                                <p
                                  key={warning}
                                  className="mt-4 flex items-start gap-2 border-l-2 border-ink bg-wash px-3 py-2 text-xs text-ink-60"
                                >
                                  <FiAlertCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink" />
                                  <span>{warning}</span>
                                </p>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>

                <div className="lg:w-[38%]">
                  <div className="sticky top-[132px] border border-rule p-7">
                    <CartTotal heading="Order summary" />

                    <button
                      type="button"
                      onClick={() => {
                        // Check if any items have inventory warnings before proceeding
                        if (blocked) {
                          toast.error('Please resolve inventory issues before checkout');
                          return;
                        }
                        navigate('/placeorder');
                      }}
                      disabled={blocked}
                      className={`mt-8 flex w-full items-center justify-center gap-2 py-4 font-michroma text-[10px] uppercase tracking-[0.18em] transition-colors duration-300 ${
                        blocked
                          ? 'cursor-not-allowed bg-wash text-ink-40'
                          : 'bg-ink text-paper hover:bg-statepurp'
                      }`}
                    >
                      Proceed to Checkout
                      <FiArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>

                    {blocked && (
                      <p className="mt-3 text-center text-xs text-ink-60">
                        Please resolve inventory issues before checkout
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => navigate('/collections/all')}
                      className="rule-draw mt-7 block w-full pb-1 text-center text-xs text-ink-60 transition-colors hover:text-ink"
                    >
                      Continue Shopping
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default Cart
