import { useParams } from 'react-router-dom';

import Seo from '../components/Seo';
import { breadcrumbLd } from '../lib/seo';
import CatalogPage from '../components/catalog/CatalogPage';

// FE-003 — this page filtered and sorted on fields the schema does not have.
//
// The type filter read `item.category`, the sidebar's checkbox list was derived
// from the same field, "newest" sorted on `item.createdAt`, and the price
// ceiling was the literal `1000` — written into the state, into the slider's
// `max`, and into the percentage arithmetic that positions the track. Products
// are categorised by `tags`; "newest" is `date`, a number of epoch milliseconds;
// and the ceiling is a property of the catalog.
//
// The practical effect of the last one was that `/collections/all` — the
// destination of the empty cart's own call to action — hid every product over
// $1,000, in a catalog whose laptops start at $1,149.
//
// FE-007 — the 121-line `ProductCard` that used to live at the top of this file
// is gone. It fabricated three images by repeating `image[0]` and read
// `product.vendor`, a field that has never existed.
//
// ---------------------------------------------------------------------------
// And the 460 lines that used to be below this comment are gone too.
// ---------------------------------------------------------------------------
//
// This page and `/products` were two browse surfaces with two filter sidebars,
// two sort controls, two loading spinners, two empty states and two card
// variants between them — neither built to the design language the homepage
// established. Both render `components/catalog/CatalogPage` now. What stays
// here is what is genuinely this route's: its title, its description, its
// canonical and its breadcrumb, all of which differ per typed collection and
// none of which the shared shell could know.
//
// The filtering itself remains in `lib/catalog.js`, as pure functions over data.

const Collections = () => {
  const { type } = useParams();
  const named = type && type !== 'all' ? type : null;

  return (
    <CatalogPage
      eyebrow={named ? 'Netronix / Collections' : 'Netronix / Catalog'}
      title={named ?? 'All Products'}
      // Phrased so it reads for any tag. The route parameter is a plural noun
      // sometimes ("laptops") and a compound one others ("gaming pcs"), so
      // "Every ${type} Netronix carries" produced "Every laptops Netronix
      // carries" — the kind of sentence only a template writes.
      description={
        named
          ? `Everything in ${named}, with real stock per variant.`
          : 'Laptops, gaming PCs, MacBooks, audio and accessories — the whole catalog, with real stock per variant.'
      }
      type={type}
    >
      {/* SEO-002 / SEO-004 / SEO-005 — a typed collection gets its own title,
          its own description and its own canonical, where every collection
          used to share the single string "Netronix". The breadcrumb is the one
          structured-data type this page can state as fact. */}
      <Seo
        title={type ? `${type}` : 'Collections'}
        description={
          type
            ? `Browse ${type} at Netronix — with real stock per variant.`
            : 'Every Netronix collection: laptops, gaming PCs, MacBooks, audio and accessories.'
        }
        path={type ? `/collections/${type}` : '/collections'}
        jsonLd={[
          breadcrumbLd(
            type
              ? [
                { name: 'Home', path: '/' },
                { name: 'Collections', path: '/collections' },
                { name: type, path: `/collections/${type}` },
              ]
              : [
                { name: 'Home', path: '/' },
                { name: 'Collections', path: '/collections' },
              ],
          ),
        ]}
      />
    </CatalogPage>
  );
};

export default Collections;
