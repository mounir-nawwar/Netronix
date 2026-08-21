import { useContext, useEffect, useMemo, useState } from 'react';
import { ShopContext } from '../context/shopContext';
import { useSearchParams } from 'react-router-dom';
import { FiFilter, FiX, FiShoppingBag } from 'react-icons/fi';
import BackButton from '../components/BackButton';
import ProductCard from '../components/ProductCard';
import { catalogPriceCeiling, matchesSearch, priceOf, sortProducts, tagsOf } from '../lib/catalog';
import Seo from '../components/Seo';
import { breadcrumbLd } from '../lib/seo';

// FE-006 / PERF-005 — this page no longer fetches the catalog.
//
// It pulled `/api/product/list` itself, and `/api/product/tags` after it, on top
// of the two copies the duplicated provider already issued and the four the
// homepage sections each issued for themselves. The catalog is loaded once, by
// the context, and read from there.
//
// FE-010 — `addMissingCategories()` is gone. It injected about forty hardcoded
// category names — `Networking`, `Clearance`, `Webcam`, `Legacy categories` —
// into the filter sidebar. None of them was a tag any product carried, so
// selecting one always returned nothing: forty checkboxes that could only ever
// produce an empty page. The taxonomy comes from `/api/product/tags`, which the
// context fetches once, with the catalog's own tags as the fallback.
//
// FE-007 — the 190-line `ProductCard` that used to live here was the best of the
// four, and it is the one `components/ProductCard` is built from: the same
// mouse-position image scrubbing, the same touch swipe, the same hover row and
// tag badges. It renders here as `variant="full"`.

const AllProducts = () => {
  const { products, tags, catalogStatus, catalogError, reloadCatalog, search, setSearch } =
    useContext(ShopContext);
  const [sortOption, setSortOption] = useState('latest');
  const [searchParams] = useSearchParams();
  const tagFromUrl = searchParams.get('tag');
  const searchFromUrl = searchParams.get('search');

  const maxPrice = useMemo(() => catalogPriceCeiling(products), [products]);

  /** Every tag the catalog actually uses. Never an invented one (FE-010). */
  const categoryOptions = useMemo(
    () => (tags?.length > 0 ? [...tags].sort() : tagsOf(products)),
    [tags, products],
  );

  /** The variant axes the catalog actually declares, and their option values. */
  const variantOptions = useMemo(() => {
    const axes = {};
    for (const product of products) {
      for (const variant of product.variants ?? []) {
        if (!variant?.name) continue;
        axes[variant.name] = axes[variant.name] ?? new Set();
        for (const option of variant.options ?? []) axes[variant.name].add(option);
      }
    }
    return Object.fromEntries(
      Object.entries(axes).map(([name, values]) => [name, [...values].sort()]),
    );
  }, [products]);

  const [selectedCategories, setSelectedCategories] = useState([]);
  const [selectedVariants, setSelectedVariants] = useState({});
  const [priceRange, setPriceRange] = useState(null);

  const [minSelected, maxSelected] = priceRange ?? [0, maxPrice];
  const effectiveRange = useMemo(() => [minSelected, maxSelected], [minSelected, maxSelected]);

  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const loading = catalogStatus === 'loading';
  const hasFailed = catalogStatus === 'error';

  // Apply the URL's tag and search term.
  useEffect(() => {
    if (tagFromUrl) setSelectedCategories([tagFromUrl]);
    else if (!searchFromUrl) setSelectedCategories([]);
  }, [tagFromUrl, searchFromUrl]);

  useEffect(() => {
    if (searchFromUrl) setSearch(searchFromUrl);
  }, [searchFromUrl, setSearch]);

  const toggleCategory = (category) => {
    setSelectedCategories((previous) =>
      previous.includes(category)
        ? previous.filter((candidate) => candidate !== category)
        : [...previous, category]);
  };

  const toggleVariantFilter = (axis, option) => {
    setSelectedVariants((previous) => {
      const selected = previous[axis] ?? [];
      const next = selected.includes(option)
        ? selected.filter((candidate) => candidate !== option)
        : [...selected, option];
      return { ...previous, [axis]: next };
    });
  };

  const handlePriceChange = (value, index) => {
    const next = [...effectiveRange];
    next[index] = value;
    if (index === 0 && value > next[1]) next[0] = next[1];
    if (index === 1 && value < next[0]) next[1] = next[0];
    setPriceRange(next);
  };

  const clearFilters = () => {
    setSelectedCategories([]);
    setSelectedVariants({});
    setPriceRange(null);
    setSortOption('latest');
  };

  /** Does this product survive the sidebar and the search box? */
  const productMatchesFilters = (product) => {
    const price = priceOf(product);
    if (price < effectiveRange[0] || price > effectiveRange[1]) return false;

    if (selectedCategories.length > 0) {
      const productTags = product.tags ?? [];
      if (!selectedCategories.some((tag) => productTags.includes(tag))) return false;
    }

    for (const [axis, selected] of Object.entries(selectedVariants)) {
      if (selected.length === 0) continue;
      const productAxis = product.variants?.find((variant) => variant.name === axis);
      if (!productAxis) return false;
      if (!selected.some((option) => productAxis.options.includes(option))) return false;
    }

    return matchesSearch(product, search);
  };

  // Sorted through the shared helper, so "latest" reads the schema's `date`
  // rather than the `createdAt` this page used to reach for.
  const sortedProducts = useMemo(
    () => sortProducts(
      products.filter(productMatchesFilters),
      sortOption === 'latest' ? 'newest' : sortOption,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, effectiveRange, selectedCategories, selectedVariants, search, sortOption],
  );

  const activeFilterCount = selectedCategories.length
    + Object.values(selectedVariants).reduce((total, selected) => total + selected.length, 0)
    + ((effectiveRange[0] > 0 || effectiveRange[1] < maxPrice) ? 1 : 0);

  return (
    <div className="min-h-screen bg-gray-50 pt-[120px] pb-12">
      {/* SEO-005 — `/products?tag=Laptops` and `/collections/laptops` are two
          paths to overlapping content. The canonical here names the *path*
          without the query, so a tag-filtered view does not compete with the
          unfiltered one in an index; the title still says which filter is on,
          because that is what a person sees. A search result page is
          `noindex`: it is a view of the catalog, not a page of its own. */}
      <Seo
        title={tagFromUrl ? `${tagFromUrl}` : 'All Products'}
        description={
          tagFromUrl
            ? `Every ${tagFromUrl} in the Netronix catalog, with real stock per variant.`
            : 'The full Netronix catalog: laptops, gaming PCs, MacBooks, components, audio and accessories.'
        }
        path="/products"
        noIndex={Boolean(searchFromUrl)}
        jsonLd={[
          breadcrumbLd([
            { name: 'Home', path: '/' },
            { name: 'Products', path: '/products' },
            ...(tagFromUrl ? [{ name: tagFromUrl, path: '/products' }] : []),
          ]),
        ]}
      />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Page Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center mb-2">
              <BackButton className="mr-4" />
              <h1 className="text-3xl font-bold text-gray-900">Products</h1>
            </div>
            <p className="text-sm text-gray-500">
              {sortedProducts.length} {sortedProducts.length === 1 ? 'product' : 'products'} available
            </p>
          </div>
        </div>

        {/* Mobile Controls */}
        <div className="lg:hidden mb-6 flex items-center justify-between">
          <button
            onClick={() => setShowMobileFilters(!showMobileFilters)}
            className="flex items-center px-4 py-2 bg-white rounded-md shadow-sm border border-gray-200 text-sm font-medium text-gray-700"
          >
            <FiFilter className="mr-2 h-4 w-4" />
            Filters {activeFilterCount > 0 && <span className="ml-1 bg-indigo-600 text-white rounded-full w-5 h-5 inline-flex items-center justify-center text-xs">{activeFilterCount}</span>}
          </button>
          
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value)}
            className="px-4 py-2 bg-white rounded-md shadow-sm border border-gray-200 text-sm text-gray-700"
          >
            <option value="latest">Latest</option>
            <option value="price-low">Price: Low to High</option>
            <option value="price-high">Price: High to Low</option>
            <option value="name-asc">Name: A to Z</option>
            <option value="name-desc">Name: Z to A</option>
          </select>
        </div>

        {/* Main Content */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Filters Sidebar */}
          <div 
            className={`w-full lg:w-64 lg:flex-shrink-0 bg-white rounded-lg shadow-sm overflow-hidden transform lg:transform-none lg:opacity-100 transition-all duration-300 ${
              showMobileFilters ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-10 lg:opacity-100 lg:translate-y-0 h-0 lg:h-auto'
            }`}
          >
            <div className={`${showMobileFilters ? 'block' : 'hidden lg:block'}`}>
              {/* Filters Header */}
              <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-white">Filters</h2>
                  {activeFilterCount > 0 && (
                    <button
                      onClick={clearFilters}
                      className="text-xs text-indigo-100 hover:text-white underline"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                {activeFilterCount > 0 && (
                  <div className="mt-2 text-xs text-indigo-100">
                    {activeFilterCount} active filter{activeFilterCount !== 1 ? 's' : ''}
                  </div>
                )}
              </div>

              <div className="p-4 divide-y divide-gray-200">
                {/* Price Range Filter */}
                <div className="py-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Price Range</h3>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="w-24">
                      <label className="text-xs text-gray-500 mb-1 block">Min ($)</label>
                      <input 
                        type="number" 
                        min="0" 
                        max={maxPrice}
                        value={effectiveRange[0]}
                        onChange={(e) => handlePriceChange(parseInt(e.target.value) || 0, 0)}
                        className="w-full py-1 px-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                    <span className="text-gray-500">-</span>
                    <div className="w-24">
                      <label className="text-xs text-gray-500 mb-1 block">Max ($)</label>
                      <input 
                        type="number" 
                        min={effectiveRange[0]}
                        max={maxPrice}
                        value={effectiveRange[1]}
                        onChange={(e) => handlePriceChange(parseInt(e.target.value) || 0, 1)}
                        className="w-full py-1 px-2 border border-gray-300 rounded text-sm"
                      />
                    </div>
                  </div>
                  
                  <div className="mt-4 relative h-2 bg-gray-200 rounded-full">
                    <div 
                      className="absolute h-full bg-indigo-600 rounded-full"
                      style={{ 
                        left: `${(effectiveRange[0] / maxPrice) * 100}%`,
                        width: `${((effectiveRange[1] - effectiveRange[0]) / maxPrice) * 100}%`
                      }}
                    ></div>
                  </div>
                </div>

                {/* Category Filters */}
                <div className="py-4">
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Categories</h3>
                  <div className="max-h-60 overflow-y-auto space-y-2 scrollbar-thin">
                    {categoryOptions.map(category => (
                      <div key={category} className="flex items-center">
                        <input
                          id={`category-${category}`}
                          type="checkbox"
                          checked={selectedCategories.includes(category)}
                          onChange={() => toggleCategory(category)}
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        />
                        <label htmlFor={`category-${category}`} className="ml-2 text-sm text-gray-700 capitalize">
                          {category}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Variant Filters */}
                {Object.entries(variantOptions).map(([variantName, options]) => (
                  <div key={variantName} className="py-4">
                    <h3 className="text-sm font-medium text-gray-900 mb-3 capitalize">{variantName}</h3>
                    <div className="space-y-2">
                      {options.map(option => (
                        <div key={option} className="flex items-center">
                          <input
                            id={`variant-${variantName}-${option}`}
                            type="checkbox"
                            checked={(selectedVariants[variantName] ?? []).includes(option)}
                            onChange={() => toggleVariantFilter(variantName, option)}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          />
                          <label htmlFor={`variant-${variantName}-${option}`} className="ml-2 text-sm text-gray-700">
                            {option}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Products Grid */}
          <div className="flex-1">
            {/* Desktop controls */}
            <div className="hidden lg:flex items-center justify-between mb-6">
              <div>
                <span className="text-sm text-gray-500">
                  {sortedProducts.length} {sortedProducts.length === 1 ? 'product' : 'products'} found
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">Sort by:</span>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="py-2 px-3 bg-white border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="latest">Latest</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                  <option value="name-desc">Name: Z to A</option>
                </select>
              </div>
            </div>
            
            {/* Active Filters Display */}
            {activeFilterCount > 0 && (
              <div className="mb-6 flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-500">Active filters:</span>
                
                {/* Price filter tag */}
                {(effectiveRange[0] > 0 || effectiveRange[1] < maxPrice) && (
                  <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                    Price: ${effectiveRange[0]} - ${effectiveRange[1]}
                    <button
                      type="button"
                      onClick={() => setPriceRange(null)}
                      className="ml-1 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500 focus:outline-none"
                    >
                      <FiX className="h-3 w-3" />
                    </button>
                  </span>
                )}
                
                {/* Category filters */}
                {selectedCategories.map(category => (
                  <span 
                    key={category}
                    className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                  >
                    {category}
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="ml-1 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500 focus:outline-none"
                    >
                      <FiX className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                
                {/* Variant filters */}
                {Object.entries(selectedVariants).map(([variantName, selected]) =>
                  selected.map(option => (
                    <span 
                      key={`${variantName}-${option}`}
                      className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700"
                    >
                      {variantName}: {option}
                      <button
                        type="button"
                        onClick={() => toggleVariantFilter(variantName, option)}
                        className="ml-1 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-indigo-400 hover:bg-indigo-200 hover:text-indigo-500 focus:outline-none"
                      >
                        <FiX className="h-3 w-3" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            )}
            
            {/* Loading state */}
            {loading ? (
              <div className="flex justify-center items-center h-64" role="status" aria-live="polite">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
                <span className="sr-only">Loading products…</span>
              </div>
            ) : hasFailed ? (
              /* FE-024 — a request that failed is not a catalog that is empty. */
              <div className="bg-white rounded-lg shadow-sm p-8 text-center" role="alert">
                <FiShoppingBag className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">We could not load the catalog</h3>
                <p className="mt-2 text-sm text-gray-500">{catalogError || 'Please try again in a moment.'}</p>
                <button
                  onClick={reloadCatalog}
                  className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700"
                >
                  Try again
                </button>
              </div>
            ) : sortedProducts.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <FiShoppingBag className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-4 text-lg font-medium text-gray-900">No products found</h3>
                <p className="mt-2 text-sm text-gray-500">Try changing your filters or search criteria</p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={clearFilters}
                    className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  >
                    Clear all filters
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
                {sortedProducts.map((product) => (
                  <ProductCard key={product._id} product={product} variant="full" className="h-full" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AllProducts; 
