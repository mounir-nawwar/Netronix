import { useContext, useMemo, useRef, useState } from 'react';

import { ShopContext } from '../context/shopContext';
import ProductCard from '../components/ProductCard';
import useMediaQuery from '../lib/useMediaQuery';

// FE-004 / PORT-001 — this section no longer names products by ObjectId.
//
// It held three arrays of literal ids, ten in all, and fetched the whole catalog
// itself to `.find()` each one. Against any database not restored from the
// original dump every lookup returned `undefined`, `.filter(Boolean)` removed
// them, and the section rendered three empty tabs on a page that otherwise
// looked fine.
//
// A product now declares that it belongs in this grid — `showcase: [{ slot:
// 'featured', order }]` — and the tabs are derived from the tags those products
// already carry. Adding a product to the homepage is an edit to the product, in
// the admin console, rather than an edit to this file and a redeploy.
//
// FE-006 — and it reads the catalog the context loaded rather than fetching one.
// Five homepage sections each pulled `/api/product/list` concurrently.

/**
 * The tabs, in the order they appear.
 *
 * Each is a tag. A tab with no featured products is dropped rather than shown
 * empty, so the row is always something a visitor can act on.
 */
const TABS = [
  { title: 'Latest Laptops', tag: 'Laptops' },
  { title: 'Gaming PCs', tag: 'Gaming PCs' },
  { title: 'MacBooks', tag: 'MacBooks' },
];

const FeaturedProducts = () => {
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [activeTab, setActiveTab] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const sliderRef = useRef(null);
  const tabsContainerRef = useRef(null);
  const { showcase, catalogStatus } = useContext(ShopContext);

  const loading = catalogStatus === 'loading';

  /**
   * The featured products, grouped into the tabs above.
   *
   * A tag that no featured product carries produces no tab: an empty tab is a
   * promise the catalog cannot keep, and this section used to show three of
   * them against any unseeded database.
   */
  const collections = useMemo(() => {
    const featured = showcase('featured');
    return TABS
      .map((tab) => ({
        ...tab,
        products: featured.filter((product) => (product.tags ?? []).includes(tab.tag)),
      }))
      .filter((tab) => tab.products.length > 0);
  }, [showcase]);

  const active = collections[Math.min(activeTab, Math.max(collections.length - 1, 0))];

  const handleTabClick = (index) => {
    setActiveTab(index);
    setCurrentPage(1);
  };

  const handlePrevious = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({
        left: -sliderRef.current.offsetWidth,
        behavior: 'smooth'
      });
    }
  };

  const handleNext = () => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({
        left: sliderRef.current.offsetWidth,
        behavior: 'smooth'
      });
    }
  };

  return (
    <section className="py-12 md:py-16 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Section Heading */}
        <div className="text-center mb-8 md:mb-12">
          <h2 className="text-2xl md:text-3xl md:text-[42px] font-michroma text-gray-900 mb-2 md:mb-4">
            Best Sellers
          </h2>
          <p className="text-sm md:text-base md:text-lg text-gray-600 max-w-3xl mx-auto font-michroma">
            Explore our curated selection of premium tech products designed for performance and reliability.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex justify-between items-center mb-6 md:mb-8">
          <div 
            ref={tabsContainerRef}
            className="scrollbar-hide flex gap-2 md:gap-4 overflow-x-auto pb-4 max-w-full"
            style={{ 
              scrollbarWidth: 'none', 
              msOverflowStyle: 'none',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            {collections.map((collection, index) => (
              <button
                key={collection.tag}
                onClick={() => handleTabClick(index)}
                className={`px-4 md:px-6 py-2 md:py-3 rounded-full font-michroma text-xs md:text-base whitespace-nowrap flex-shrink-0 ${
                  activeTab === index 
                    ? 'bg-[#6a5acd] text-white' 
                    : 'fill-button fill-button-gray'
                }`}
              >
                {collection.title}
              </button>
            ))}
          </div>

          <div className="hidden lg:flex gap-2">
            <button
              onClick={handlePrevious}
              className="p-3 rounded-full bg-[#f9f9f9] text-[#6a5acd] hover:scale-110 transition-transform shadow-md"
              aria-label="Previous"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNext}
              className="p-3 rounded-full bg-[#f9f9f9] text-[#6a5acd] hover:scale-110 transition-transform shadow-md"
              aria-label="Next"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* FE-004 — an empty catalog gets an honest empty state. It used to get
            three tabs of nothing, or, in `ShopTheLook`, four invented products. */}
        {!loading && collections.length === 0 && (
          <p className="text-center text-gray-500 font-michroma text-sm py-12">
            No featured products yet.
          </p>
        )}

        {/* Mobile Product View. Rendered only when there is a tab to render:
            hiding it with a class still evaluates `active.products`, and
            `active` is undefined when no product claims the slot.

            PERF-003 — and only when it is the one on screen. Both this
            carousel and the desktop grid below used to render every card, with
            CSS hiding one of them: the homepage mounted eight `ProductCard`s
            to show four, each with its own scrubbing hooks, dot row and
            `framer-motion` wrappers. `display: none` hides a subtree from the
            eye, not from React. */}
        {active && !isDesktop && (
        <div className="md:hidden">
          {loading ? (
            <div className="py-12 flex justify-center">
              <div className="w-10 h-10 border-t-2 border-b-2 border-[#6a5acd] rounded-full animate-spin"></div>
            </div>
          ) : (
            <div 
              className="scrollbar-hide flex gap-4 overflow-x-auto pb-6 scroll-smooth snap-x"
              style={{ 
                scrollbarWidth: 'none', 
                msOverflowStyle: 'none',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {active.products.map((product) => (
                <div 
                  key={product._id} 
                  className="flex-shrink-0 snap-start"
                  style={{ width: 'calc((100% - 32px) / 2.15)' }} // Show 2 wider cards with just a peek of the third
                >
                  <ProductCard product={product} variant="showcase" showQuickAdd />
                </div>
              ))}
            </div>
          )}
          
          {/* Mobile Navigation Indicators */}
          <div className="flex justify-center gap-1 mt-2">
            {[...Array(Math.ceil(active.products.length / 2))].map((_, index) => (
              <div 
                key={index}
                className={`w-1.5 h-1.5 rounded-full ${
                  Math.floor(currentPage / 2) === index 
                    ? 'bg-[#6a5acd]' 
                    : 'bg-gray-300'
                }`}
              />
            ))}
          </div>
        </div>
        )}

        {/* Desktop Product Grid - Original Layout */}
        {active && isDesktop && (
        <div 
          ref={sliderRef}
          className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6 overflow-x-auto scroll-smooth"
        >
          {loading ? (
            <div className="col-span-4 py-12 flex justify-center">
              <div className="w-10 h-10 border-t-2 border-b-2 border-[#6a5acd] rounded-full animate-spin"></div>
            </div>
          ) : (
            active.products.map((product) => (
              <ProductCard key={product._id} product={product} variant="showcase" showQuickAdd />
            ))
          )}
        </div>
        )}
      </div>
    </section>
  );
};

export default FeaturedProducts; 