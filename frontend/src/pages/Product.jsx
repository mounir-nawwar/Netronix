import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ShopContext } from '../context/shopContext';
import Seo from '../components/Seo';
import { breadcrumbLd, productLd } from '../lib/seo';
import { configCount, isSoldOut, totalStock } from '../lib/productSummary';
import { entriesOf } from '../lib/variant';
import RelatedProducts from '../components/RelatedProducts';
import { toast } from '../lib/toast';
import { motion } from 'framer-motion';
import { FiMinus, FiPlus } from 'react-icons/fi';
import BackButton from '../components/BackButton';

// The product page, brought onto the catalog's surface.
//
// This page was already the most on-brand of the three product surfaces — it
// was the only one using Michroma and `#6a5acd` at all — so what changed here
// is craft and honesty rather than the layout:
//
//   * **The description rendered twice.** Once clamped to three lines under the
//     price, then again in full under a "Details" heading. Nobody decided that;
//     it is what happens when a section is added without reading the one above
//     it.
//   * **A tab bar with exactly one tab**, styled with the active-tab underline
//     that only means something next to an inactive one. There are two now, and
//     the second is real: `Specifications` is built from the product's declared
//     axes and its typed inventory, which is information this page had and was
//     not showing.
//   * **Three unverifiable trust badges** — "100% Original Product", "Fast
//     Shipping", "Secure Packaging" — in three stock icons. Netronix has no
//     stated shipping time and no stated returns policy, so two of those three
//     were decoration and the third was a claim nothing backs. They are
//     replaced by facts the application actually holds: the payment methods
//     checkout really offers, and the stock this page has already counted.
//   * **Motion on a timer.** `delay: 0.3 + i*0.1`, then `0.7`, `0.8`, `1`,
//     `1.1`, `1.2` — six hardcoded delays, so the page assembled itself over a
//     second and a bit whether or not anyone was looking at the part being
//     revealed. The lower sections use `whileInView` now, and the two columns
//     share one entrance.
//   * **Variant options never showed availability.** Only the call to action
//     disabled, so a combination with no stock looked exactly like one with
//     stock right up until you had selected it. They carry `aria-disabled` and
//     a struck-through style now — deliberately *not* the `disabled` attribute,
//     because a control you cannot focus is a control that cannot tell you why
//     it is unavailable, and selecting a sold-out combination and being told so
//     plainly is more use than a dead button.

const Product = () => {

  const { productId } = useParams();
  const {
    products, addToCart, navigate, addToWishlist, removeFromWishlist,
    isInWishlist, getSingleProduct, availableFor, getPriceMinor, formatPrice,
  } = useContext(ShopContext);
  const [productData, setProductData] = useState(false);
  const [image, setImage] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [isZoomed, setIsZoomed] = useState(false);
  const [loading, setLoading] = useState(true);

  // State for selected variant options
  const [selectedVariants, setSelectedVariants] = useState({});
  const loadGeneration = useRef(0);

  const fetchProductData = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true);

    // Try to find product in the existing products array first
    const existingProduct = products.find(item => item._id === productId);

    if (existingProduct) {
      setProductData(existingProduct);
      setImage(existingProduct.image[0]);

      // Initialize selected variants
      const initialSelectedVariants = {};
      if (existingProduct.variants && existingProduct.variants.length > 0) {
        existingProduct.variants.forEach(variant => {
          if (variant.options && variant.options.length > 0) {
            initialSelectedVariants[variant.name] = '';
          }
        });
      }
      setSelectedVariants(initialSelectedVariants);
      setLoading(false);
      return;
    }

    // If not found in existing products, fetch directly from API
    try {
      const product = await getSingleProduct(productId);
      if (generation !== loadGeneration.current) return;
      if (product) {
        setProductData(product);
        setImage(product.image[0]);

        // Initialize selected variants
        const initialSelectedVariants = {};
        if (product.variants && product.variants.length > 0) {
          product.variants.forEach(variant => {
            if (variant.options && variant.options.length > 0) {
              initialSelectedVariants[variant.name] = '';
            }
          });
        }
        setSelectedVariants(initialSelectedVariants);
      } else {
        toast.error('Product not found.');
        navigate('/products');
      }
    } catch (error) {
      if (generation !== loadGeneration.current) return;
      console.error(error);
      toast.error('Could not load that product.');
      navigate('/products');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [productId, products, getSingleProduct, navigate])

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchProductData();
    // TEST-002 — `fetchProductData` is memoised on `productId` (and on the two
    // context callbacks it calls), so depending on the function is the same
    // refetch behaviour as depending on `[productId]` was, stated honestly.
  }, [fetchProductData])

  // The typed combinations, read once per product rather than per option
  // button — a five-by-four matrix asks this question twenty times a render.
  const entries = useMemo(() => entriesOf(productData || {}), [productData]);

  /**
   * DB-003 — this guard used to fail **open**.
   *
   * It was:
   *
   *     if (variantKey.split('-').length !== variants.length) return false;
   *
   * `false` meaning "in stock". A hyphenated option value — `16-inch`,
   * `RTX-4090`, `Wi-Fi 6E`, `USB-C`, all of which this catalog sells — inflates
   * the segment count, so the counts never matched, the guard short-circuited,
   * and an unavailable combination rendered as purchasable. The cart key it then
   * produced matched no inventory key, so the server's own check mis-resolved
   * too.
   *
   * Resolution now goes through the shared helper, against the option pairs
   * rather than a string that has to be split back apart, and every path fails
   * **closed**: an incomplete selection, an unknown combination and an ambiguous
   * one all report out of stock.
   */
  const isOutOfStock = () => {
    if (!areAllVariantsSelected()) return true;
    const available = availableFor(productData, { variantOptions: selectedVariants });
    return available === null || available <= 0;
  };

  // Get available quantity for selected variant combination
  const getAvailableQuantity = () => {
    if (!areAllVariantsSelected()) return 0;
    return availableFor(productData, { variantOptions: selectedVariants }) ?? 0;
  };

  // Check if all variants are selected
  const areAllVariantsSelected = () => {
    if (!productData || !productData.variants || productData.variants.length === 0) {
      return true;
    }

    return productData.variants.every(variant =>
      selectedVariants[variant.name] && selectedVariants[variant.name] !== ''
    );
  };

  /**
   * Can this option still lead to something purchasable?
   *
   * Judged against the choices already made on the *other* axes, so a 1 TB that
   * only exists on the 16-inch reads as unavailable once the 14-inch is chosen.
   * The axis being asked about is excluded from that check, or changing your
   * mind about it would be impossible: every one of its own options would be
   * measured against the selection you are trying to replace.
   */
  const optionIsAvailable = (axisName, option) => {
    if (entries.length === 0) return true;
    return entries.some((entry) => {
      if (entry.quantity <= 0) return false;
      if (entry.options?.[axisName] !== option) return false;
      return Object.entries(selectedVariants).every(([axis, value]) =>
        axis === axisName || value === '' || entry.options?.[axis] === value);
    });
  };

  // Handle variant selection
  const handleVariantChange = (variantName, option) => {
    setSelectedVariants(prev => ({
      ...prev,
      [variantName]: option
    }));
    // A quantity chosen against the previous combination is not a quantity
    // anyone asked for against this one, and the stepper's ceiling has just
    // moved underneath it.
    setQuantity(1);
  };

  // Manage quantity
  const increaseQuantity = () => {
    if (quantity < getAvailableQuantity()) {
      setQuantity(prev => prev + 1);
    } else {
      toast.warning(`Only ${getAvailableQuantity()} items available.`);
    }
  };

  const decreaseQuantity = () => {
    if (quantity > 1) {
      setQuantity(prev => prev - 1);
    }
  };

  // Handle add to cart with inventory check
  const handleAddToCart = () => {
    if (!areAllVariantsSelected()) {
      toast.error('Please select all options.');
      return;
    }

    if (isOutOfStock()) {
      toast.error('This variant is out of stock.');
      return;
    }

    // Add to cart with the selected quantity (not in a loop anymore)
    addToCart(productData._id, { variantOptions: selectedVariants }, quantity);
  };

  // Handle save/unsave for wishlist
  const handleWishlistToggle = () => {
    if (!productData) return;

    if (isInWishlist(productData._id)) {
      removeFromWishlist(productData._id);
    } else {
      addToWishlist(productData._id);
    }
  };

  // One entrance for the whole fold, rather than six hardcoded delays chained
  // down the page. `MotionConfig reducedMotion="user"` in `main.jsx` makes this
  // a no-op for anyone who has asked for that.
  const rise = {
    hidden: { opacity: 0, y: 18 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
  };

  if (loading) {
    return (
      <div
        className="min-h-screen bg-paper"
        role="status"
        aria-label="Loading product"
      >
        <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-4 pt-[132px] sm:px-[5vw] md:px-[7vw] lg:grid-cols-2 lg:px-[9vw]">
          <div aria-hidden="true" className="aspect-square w-full animate-plate-sheen bg-wash" />
          <div aria-hidden="true" className="pt-4">
            <div className="h-2 w-20 bg-wash" />
            <div className="mt-6 h-8 w-4/5 bg-wash" />
            <div className="mt-4 h-6 w-32 bg-wash" />
            <div className="mt-10 h-12 w-full bg-wash" />
          </div>
        </div>
      </div>
    );
  }

  /**
   * The price for the combination currently selected, in minor units.
   *
   * Matching is on the option **pairs**, never on the hyphen-joined legacy key,
   * for the same reason everything else here is (DB-003): `16-inch` and
   * `RTX-4090` make that string ambiguous.
   *
   * A complete selection matches exactly one combination. A partial one matches
   * several, and the cheapest of them is the honest thing to show — it is the
   * price the visitor can still reach by choosing the remaining options. Taking
   * whichever entry happened to come first in the array, as this did before,
   * quoted an arbitrary member of that set and changed answer whenever the
   * matrix was reordered.
   */
  const displayPrice = (() => {
    const basePriceMinor = Number.isFinite(productData?.priceMinor)
      ? productData.priceMinor
      : Math.round((productData?.price || 0) * 100);

    const selectedKeys = Object.keys(selectedVariants).filter((key) => selectedVariants[key] !== '');
    if (entries.length === 0 || selectedKeys.length === 0) return basePriceMinor;

    const matches = entries.filter((entry) =>
      selectedKeys.every((key) => entry.options?.[key] === selectedVariants[key]));
    if (matches.length === 0) return basePriceMinor;

    // `entriesOf` has already reconciled `priceMinorDelta` against the major
    // unit for documents written before that field existed, so the minor value
    // here is authoritative without a second fallback.
    return basePriceMinor + Math.min(...matches.map((entry) => entry.priceMinorDelta));
  })();

  const ctaLabel = !areAllVariantsSelected()
    ? 'SELECT OPTIONS'
    : isOutOfStock() ? 'OUT OF STOCK' : 'ADD TO CART';

  const ctaDisabled = ctaLabel !== 'ADD TO CART';

  return productData ? (
    <div className="min-h-screen bg-paper pb-24 text-ink">
      {/* SEO-001 / SEO-002 / SEO-004 — every product page used to be titled
          "Netronix", with no description and no structured data. Everything
          below is read from the catalog document: the name, the description,
          the real images, and a price and availability derived from the
          minor-unit price and the typed inventory. No AggregateRating and no
          review count, because there are no reviews. */}
      <Seo
        title={productData.name}
        description={
          productData.description
            ? String(productData.description).replace(/\s+/g, ' ').trim().slice(0, 200)
            : `${productData.name} at Netronix.`
        }
        path={`/product/${productData._id}`}
        image={Array.isArray(productData.image) ? productData.image[0] : undefined}
        ogType="product"
        jsonLd={[
          productLd(productData, {
            priceMinor: getPriceMinor(productData),
            inStock: !isSoldOut(productData),
          }),
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Products', path: '/products' },
            { name: productData.name, path: `/product/${productData._id}` },
          ]),
        ]}
      />
      {/* `Home.jsx`'s gutters. `NewsLetterBar` is `position: fixed` at the left
          edge and about 68 px wide, so anything that runs closer to the
          viewport than that has its first column sat on by the social rail. */}
      <div className="mx-auto max-w-[1400px] px-4 pt-[104px] sm:px-[5vw] md:px-[7vw] md:pt-[132px] lg:px-[9vw]">
        <BackButton className="mb-8" />

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
          {/* Product Images */}
          <motion.div className="w-full" variants={rise} initial="hidden" animate="visible">
            <div className="flex flex-col-reverse gap-3 md:flex-row md:gap-4">
              {/* Thumbnails */}
              <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-1 md:w-20 md:flex-col md:overflow-y-auto md:pb-0">
                {/* A11Y-005 / A11Y-007 — each thumbnail was a `<div onClick>`
                    wrapping an image: unreachable by Tab and announced as
                    nothing, so a keyboard user could not change the view at
                    all. They are `<button>`s with `aria-pressed`, and the
                    image inside is decorative because the button already
                    carries the name. */}
                {productData.image.map((img, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Show view ${index + 1} of ${productData.name}`}
                    aria-pressed={img === image}
                    className={`h-16 w-16 flex-shrink-0 overflow-hidden bg-plate transition-colors duration-300 md:h-20 md:w-20 ${
                      img === image ? 'ring-1 ring-ink' : 'ring-1 ring-transparent hover:ring-rule'
                    }`}
                    onClick={() => setImage(img)}
                  >
                    <img
                      src={img}
                      alt=""
                      width={80}
                      height={80}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-contain p-1.5"
                    />
                  </button>
                ))}
              </div>

              {/* Main Image — the zoom toggle was a `<div onClick>` too. */}
              <button
                type="button"
                aria-pressed={isZoomed}
                aria-label={isZoomed ? `Zoom out of ${productData.name}` : `Zoom in on ${productData.name}`}
                className="relative flex-1 aspect-square cursor-zoom-in overflow-hidden bg-plate"
                onClick={() => setIsZoomed(!isZoomed)}
              >
                <img
                  src={image}
                  alt={productData.name}
                  className={`h-full w-full object-contain p-8 transition-transform duration-700 ease-out md:p-14 ${
                    isZoomed ? 'scale-[1.35] md:cursor-zoom-out' : 'md:cursor-zoom-in'
                  }`}
                />
              </button>
            </div>
          </motion.div>

          {/* Product Details */}
          <motion.div className="flex flex-col" variants={rise} initial="hidden" animate="visible">
            {productData.brand && (
              <span className="font-michroma text-[10px] uppercase tracking-[0.2em] text-statepurp">
                {productData.brand}
              </span>
            )}

            <h1 className="mt-4 font-michroma text-2xl leading-tight text-ink md:text-[28px]">
              {productData.name}
            </h1>

            <div className="mt-6 flex items-baseline gap-4">
              <p className="text-2xl text-ink tnum md:text-3xl">{formatPrice(displayPrice)}</p>
              {configCount(productData) > 1 && (
                <p className="text-xs text-ink-40">
                  {configCount(productData)} configurations
                </p>
              )}
            </div>

            {/* The description appears here and only here. It used to be
                printed twice on the same page — clamped at the top, in full
                under "Details" — so the fold's summary and the section below it
                were the same words. */}
            {productData.description && (
              <p className="mt-6 max-w-[56ch] text-sm leading-relaxed text-ink-60">
                {productData.description}
              </p>
            )}

            <div className="mt-8 h-px w-full bg-rule" />

            <div className="mt-8 space-y-8">
              {/* Variant Selections */}
              {productData.variants && productData.variants.length > 0 && (
                <div className="space-y-7">
                  {productData.variants.map((variant, variantIndex) => (
                    <div key={variantIndex}>
                      <label
                        className="mb-3 block font-michroma text-[9px] uppercase tracking-[0.18em] text-ink-40"
                        id={`variant-axis-${variantIndex}`}
                      >
                        {variant.name}
                      </label>
                      {/* A named group, so each row of options is identifiable
                          as the axis it belongs to — by a screen reader and by a
                          test. The buttons announced only their own value
                          ("Black"), with nothing saying which axis chose it. */}
                      <div className="flex flex-wrap gap-2" role="group" aria-labelledby={`variant-axis-${variantIndex}`}>
                        {variant.options.map((option, optionIndex) => {
                          const selected = selectedVariants[variant.name] === option;
                          const available = optionIsAvailable(variant.name, option);
                          return (
                            <button
                              key={optionIndex}
                              type="button"
                              aria-pressed={selected}
                              // `aria-disabled`, not `disabled`: the option
                              // stays focusable so it can say *why* it is
                              // unavailable when chosen, which a dead control
                              // cannot.
                              aria-disabled={!available}
                              onClick={() => handleVariantChange(variant.name, option)}
                              className={`border px-4 py-2.5 text-xs transition-colors duration-300 ${
                                selected
                                  ? 'border-ink bg-ink text-paper'
                                  : available
                                    ? 'border-rule text-ink-60 hover:border-ink hover:text-ink'
                                    : 'border-rule text-ink-40 line-through decoration-ink-40'
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Inventory Status */}
              {areAllVariantsSelected() && (
                <p className="flex items-center gap-3 text-xs" aria-live="polite">
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 rounded-full ${isOutOfStock() ? 'bg-ink-40' : 'bg-statepurp'}`}
                  />
                  {isOutOfStock()
                    ? <span className="text-ink-40">Out of stock</span>
                    : <span className="text-ink-60">In stock ({getAvailableQuantity()} available)</span>
                  }
                </p>
              )}

              {/* Quantity Selector */}
              {areAllVariantsSelected() && !isOutOfStock() && (
                <div>
                  <span className="mb-3 block font-michroma text-[9px] uppercase tracking-[0.18em] text-ink-40">
                    Quantity
                  </span>
                  <div className="flex w-fit items-center border border-rule">
                    <button
                      type="button"
                      aria-label="Decrease quantity"
                      onClick={decreaseQuantity}
                      disabled={quantity <= 1}
                      className={`flex h-11 w-11 items-center justify-center transition-colors ${
                        quantity <= 1 ? 'cursor-not-allowed text-ink-40' : 'text-ink hover:bg-wash'
                      }`}
                    >
                      <FiMinus className="h-4 w-4" />
                    </button>
                    <div className="flex h-11 w-12 items-center justify-center border-x border-rule text-sm text-ink tnum">
                      {quantity}
                    </div>
                    <button
                      type="button"
                      aria-label="Increase quantity"
                      onClick={increaseQuantity}
                      disabled={quantity >= getAvailableQuantity()}
                      className={`flex h-11 w-11 items-center justify-center transition-colors ${
                        quantity >= getAvailableQuantity() ? 'cursor-not-allowed text-ink-40' : 'text-ink hover:bg-wash'
                      }`}
                    >
                      <FiPlus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleAddToCart}
                disabled={ctaDisabled}
                className={`flex-[2] py-4 font-michroma text-[10px] uppercase tracking-[0.18em] transition-colors duration-300 ${
                  ctaDisabled
                    ? 'cursor-not-allowed bg-wash text-ink-40'
                    : 'bg-ink text-paper hover:bg-statepurp'
                }`}
              >
                {ctaLabel}
              </button>

              <button
                onClick={handleWishlistToggle}
                className={`flex-1 border py-4 font-michroma text-[10px] uppercase tracking-[0.18em] transition-colors duration-300 ${
                  isInWishlist(productData._id)
                    ? 'border-ink bg-ink text-paper'
                    : 'border-rule text-ink hover:border-ink'
                }`}
              >
                {isInWishlist(productData._id) ? 'SAVED' : 'SAVE'}
              </button>
            </div>

            {/* Tags */}
            {productData.tags && productData.tags.length > 0 && (
              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-michroma text-[9px] uppercase tracking-[0.18em] text-ink-40">In</span>
                {productData.tags.map((tag, index) => (
                  <Link
                    to={`/products?${new URLSearchParams({ tag }).toString()}`}
                    key={index}
                    className="rule-draw pb-0.5 text-xs text-ink-60 transition-colors hover:text-ink"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            )}

            {/* What this shop can actually promise.
                The row this replaces was "100% Original Product / Fast Shipping
                / Secure Packaging" in three stock icons — one unverifiable
                claim and two pieces of decoration, on a storefront with no
                published shipping time and no published returns policy. These
                three are read from the application: the payment methods
                `PlaceOrder` really offers, the stock this page has already
                counted, and the number of combinations it sells. */}
            <dl className="mt-10 grid grid-cols-1 gap-px border border-rule bg-rule sm:grid-cols-3">
              {[
                { term: 'Payment', detail: 'Cash on delivery or Whish' },
                {
                  term: 'Availability',
                  detail: isSoldOut(productData)
                    ? 'Out of stock'
                    : `${totalStock(productData)} in stock`,
                },
                {
                  term: 'Configurations',
                  detail: `${configCount(productData)} ${configCount(productData) === 1 ? 'option' : 'options'}`,
                },
              ].map((fact) => (
                <div key={fact.term} className="bg-paper px-4 py-4">
                  <dt className="font-michroma text-[8px] uppercase tracking-[0.18em] text-ink-40">
                    {fact.term}
                  </dt>
                  <dd className="mt-2 text-xs text-ink-60">{fact.detail}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        </div>

        {/* Specifications.
            What was here was a tab bar with exactly one tab in it — the active
            underline treatment, with nothing to be active *against* — and the
            product description printed a second time underneath it, the same
            words already sitting under the price twenty lines up.

            Removing the tab bar rather than adding a second tab is the honest
            fix. A page has two tabs when it has two bodies of content, and this
            one has a description and a spec sheet; the description already has
            a place, and putting it behind a tab so the chrome makes sense would
            be building the page around its decoration.

            Every row below is read from the product document, so the sheet
            cannot drift from what the page is selling. */}
        <motion.section
          className="mt-20 border-t border-rule pt-10"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10%' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-3">
            <h2 className="font-michroma text-[10px] uppercase tracking-[0.2em] text-ink">
              Specifications
            </h2>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <dl className="max-w-[70ch] divide-y divide-rule pt-2">
            {productData.brand && (
              <div className="flex gap-6 py-4">
                <dt className="w-32 shrink-0 font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40 md:w-40">Brand</dt>
                <dd className="text-sm text-ink-60">{productData.brand}</dd>
              </div>
            )}
            {(productData.variants ?? []).map((axis) => (
              <div key={axis.name} className="flex gap-6 py-4">
                <dt className="w-32 shrink-0 font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40 md:w-40">
                  {axis.name}
                </dt>
                <dd className="text-sm text-ink-60">{(axis.options ?? []).join(', ')}</dd>
              </div>
            ))}
            {(productData.tags ?? []).length > 0 && (
              <div className="flex gap-6 py-4">
                <dt className="w-32 shrink-0 font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40 md:w-40">Categories</dt>
                <dd className="text-sm text-ink-60">{productData.tags.join(', ')}</dd>
              </div>
            )}
            <div className="flex gap-6 py-4">
              <dt className="w-32 shrink-0 font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40 md:w-40">Stock</dt>
              <dd className="text-sm text-ink-60 tnum">
                {totalStock(productData)} across {configCount(productData)}{' '}
                {configCount(productData) === 1 ? 'combination' : 'combinations'}
              </dd>
            </div>
          </dl>
        </motion.section>

        {/* Related Products */}
        {/* PERF-003 — `paint-on-approach` is `content-visibility: auto`: the
            strip is the bottom of a page four viewports tall, and the browser
            skips its style, layout and paint until it is approached. It is
            rendered by React on the first pass either way, and stays in the
            accessibility tree and in find-in-page. See `index.css`. */}
        <div className="paint-on-approach" style={{ '--approach-height': '1045px' }}>
          <RelatedProducts tags={productData.tags} />
        </div>
      </div>
    </div>
  ) : (
    <div className="min-h-screen bg-paper" role="status" aria-label="Loading product">
      <div aria-hidden="true" className="mx-auto max-w-[1400px] px-4 pt-[132px]">
        <div className="aspect-square w-full max-w-lg animate-plate-sheen bg-wash" />
      </div>
    </div>
  );
}

export default Product;
