import { useContext, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ShopContext } from '../context/shopContext';
import Seo from '../components/Seo';
import { breadcrumbLd } from '../lib/seo';
import CatalogPage from '../components/catalog/CatalogPage';

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
// ---------------------------------------------------------------------------
// The page's own 370 lines of chrome are gone.
// ---------------------------------------------------------------------------
//
// This surface and `/collections` did the same job to two different designs,
// and this was the worse of the two: a `bg-gradient-to-r from-indigo-600
// to-purple-600` sidebar header in a palette the brand does not use, a price
// "slider" that was a `<div>` nobody could drag, raw checkboxes, a native
// `<select>`, and `variant="full"` cards carrying five hardcoded stars each.
// All of it is `components/catalog/CatalogPage` now.
//
// What stays is what belongs to *this* route: its canonical and its `noIndex`
// for search views, and the two query parameters other parts of the site link
// here with — `?tag=` from the navbar's products dropdown, `?search=` from the
// search bar. The shared shell knows about neither.

const AllProducts = () => {
  const { search, setSearch } = useContext(ShopContext);
  const [searchParams] = useSearchParams();
  const tagFromUrl = searchParams.get('tag');
  const searchFromUrl = searchParams.get('search');

  // The search bar's term is context state shared with the navbar overlay, so
  // a link that arrives carrying one has to hand it over rather than keep a
  // second copy that the overlay would immediately contradict.
  useEffect(() => {
    if (searchFromUrl && searchFromUrl !== search) setSearch(searchFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchFromUrl, setSearch]);

  const title = searchFromUrl
    ? `Results for “${searchFromUrl}”`
    : tagFromUrl || 'All Products';

  return (
    <CatalogPage
      eyebrow={searchFromUrl ? 'Netronix / Search' : 'Netronix / Catalog'}
      title={title}
      // Three states, and the search one has to be its own: a page showing two
      // results for "MacBook" describing itself as "the full Netronix catalog"
      // is the page's copy contradicting the page.
      description={
        searchFromUrl
          ? `Everything in the catalog matching “${searchFromUrl}”.`
          : tagFromUrl
            ? `Everything in ${tagFromUrl}, with real stock per variant.`
            : 'The full Netronix catalog: laptops, gaming PCs, MacBooks, components, audio and accessories.'
      }
      type={tagFromUrl ?? undefined}
      useSearchTerm
    >
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
    </CatalogPage>
  );
};

export default AllProducts;
