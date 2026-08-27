import { useContext, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ShopContext } from '../context/shopContext';
import ProductCard from '../components/ProductCard';
import CardSkeleton from '../components/catalog/CardSkeleton';
import BackButton from '../components/BackButton';
import Panel from '../components/Panel';
import Button from '../components/Button';
import Seo from '../components/Seo';
import { DENSITIES } from '../lib/catalogView';

// FE-013 — the spinner that never stopped.
//
// `setIsLoading(false)` was inside `if (products.length > 0)`, so the only way
// out of the loading state was a catalog with at least one product in it. A
// fresh database, a failed catalog request, or an account with nothing saved all
// produced the same thing: a spinner, for ever, with no error and no empty
// state. The one case the page most needed to handle — "you have not saved
// anything yet" — was the case it could not reach.
//
// It settles on whatever actually happened now: loading, empty, or failed.
//
// ---------------------------------------------------------------------------
// The redesign, and the fifth product card
// ---------------------------------------------------------------------------
//
// This page was the last one on the old palette — `bg-gray-50`, `rounded-xl
// shadow-sm`, `text-3xl font-bold`, `#6a5acd` typed in four times — and, more
// to the point, it carried a **fifth copy of the product card**. FE-007
// consolidated four of them into `ProductCard` precisely so a fix to image
// handling or keyboard access would be made once; this one was not in that
// count, and it had drifted the way all of them did:
//
//   * `image[0]` with no `onError`, so a dead URL left a broken-image glyph
//     where every other surface falls back to an inline SVG;
//   * no stock signal at all, so a saved product that has since sold out was
//     still offered with an "Add to Cart" button;
//   * `product.variants?.length > 0 ? 'View Options' : 'Add to Cart'`, a second
//     implementation of a decision `defaultVariantSelection` already makes;
//   * **two remove buttons per card**, both labelled `Remove from wishlist`.
//     One over the image, one in the action row. To a screen reader every saved
//     product had two identically-named controls and no way to tell which was
//     which, or that they did the same thing.
//
// It renders `ProductCard` now, so it inherits the scrubbing, the sold-out
// chip, the placeholder handling and the working quick-add for free.
//
// The remove control sits **below** the card rather than on it. `ProductCard`
// puts a full-bleed overlay `<Link>` at `z-10` and its quick-add at `z-20`, with
// the stock chip top-left and the mobile quick-add pill top-right; a third
// control layered into that would have to win a z-index argument and would land
// on one of the other two at some breakpoint. Underneath, it is unambiguous at
// every width, reachable in tab order, and — being one control rather than two —
// can finally carry the product's name.
const Wishlist = () => {
  const {
    wishlist, wishlistStatus, products, catalogStatus, catalogError, reloadCatalog,
    removeFromWishlist, navigate,
  } = useContext(ShopContext);
  const [wishlistProducts, setWishlistProducts] = useState([]);

  // Both requests have to settle before the list means anything: the wishlist
  // supplies the ids and the catalog supplies the products they name.
  const isLoading = wishlistStatus === 'loading' || wishlistStatus === 'idle' || catalogStatus === 'loading';
  const hasFailed = wishlistStatus === 'error' || catalogStatus === 'error';

  useEffect(() => {
    setWishlistProducts(wishlist.map(id => products.find(p => p._id === id)).filter(Boolean));
  }, [wishlist, products]);

  const count = wishlistProducts.length;

  return (
    <div className="min-h-screen bg-paper px-4 pb-24 text-ink sm:px-[5vw] md:px-[7vw] lg:px-[9vw]">
      <Seo title="Your Wishlist" description="Products you have saved at Netronix." />

      <motion.div
        className="mx-auto max-w-[1200px]"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="pt-[104px] md:pt-[132px]">
          <div className="flex items-center gap-3">
            {/* FE-005 — `navigate(-1)` used to reach `navigateWithContext`, which
                called `.includes()` on the number, threw, and fell back to
                `window.location.href = -1`: a full page load of "/-1" and a
                blank screen. `BackButton` hands the step to the router, and is
                the same control the cart and the product page use. */}
            <BackButton showLabel={false} />
            <span className="font-michroma text-[9px] uppercase tracking-[0.22em] text-statepurp md:text-[10px]">
              Netronix / Saved
            </span>
            <span className="h-px flex-1 bg-rule" />
          </div>

          <h1
            className="mt-5 font-michroma uppercase leading-[0.95] tracking-tight text-ink"
            style={{ fontSize: 'clamp(2rem, 6vw, 4rem)' }}
          >
            My Wishlist
          </h1>

          {/* Announced, because removing the last item changes this line and
              nothing else on the page says what happened. */}
          <p className="mt-5 text-sm text-ink-60 tnum" aria-live="polite">
            {isLoading ? 'Loading your saved items…' : `${count} ${count === 1 ? 'item' : 'items'} saved`}
          </p>
        </header>

        <div className="pt-10">
          {isLoading ? (
            <div role="status" aria-live="polite">
              <div className={`grid ${DENSITIES.comfortable} gap-x-5 gap-y-12 md:gap-x-6 md:gap-y-16`}>
                {Array.from({ length: 6 }, (_, index) => <CardSkeleton key={index} index={index} />)}
              </div>
              <span className="sr-only">Loading your saved items…</span>
            </div>
          ) : hasFailed ? (
            <Panel
              role="alert"
              heading="We could not load your saved items"
              body={catalogError || 'Please try again in a moment.'}
              action={
                <Button
                  type="button"
                  variant="solid"
                  onClick={reloadCatalog}
                  className="mt-8 px-8 py-3 text-[9px] tracking-[0.16em]"
                >
                  Try again
                </Button>
              }
            />
          ) : count === 0 ? (
            <Panel
              heading="Your wishlist is empty"
              body="Products you save are kept here, across devices, for as long as you are signed in."
              action={
                <Button
                  type="button"
                  variant="solid"
                  onClick={() => navigate('/products')}
                  className="mt-8 px-8 py-3 text-[9px] tracking-[0.16em]"
                >
                  Explore Products
                </Button>
              }
            />
          ) : (
            <div className={`grid ${DENSITIES.comfortable} gap-x-5 gap-y-12 md:gap-x-6 md:gap-y-16`}>
              {/* `popLayout` takes a removed card out of flow immediately, so the
                  cards after it glide up rather than waiting for the exit to
                  finish and then jumping — the same treatment the catalog grid
                  gives a filtered-out product. */}
              <AnimatePresence mode="popLayout" initial={false}>
                {wishlistProducts.map((product) => (
                  <motion.div
                    key={product._id}
                    layout
                    className="flex flex-col"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{
                      duration: 0.45,
                      ease: [0.22, 1, 0.36, 1],
                      layout: { duration: 0.4, ease: [0.22, 1, 0.36, 1] },
                    }}
                  >
                    <ProductCard product={product} variant="showcase" showQuickAdd />

                    <button
                      type="button"
                      onClick={() => removeFromWishlist(product._id)}
                      // The product's name, because a page of controls all
                      // announced as "Remove from wishlist" is a page of
                      // identical targets — which is exactly what the two
                      // buttons this replaces produced, twice over.
                      aria-label={`Remove ${product.name} from wishlist`}
                      className="mt-3 self-start font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40 transition-colors duration-300 hover:text-statepurp"
                    >
                      Remove
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Wishlist;
