import { useContext, useMemo } from 'react';
import { useParams } from 'react-router-dom';

import { ShopContext } from '../context/shopContext';
import { tagsOf } from '../lib/catalog';
import { absolute, breadcrumbLd } from '../lib/seo';
import Seo from '../components/Seo';
import CatalogPage from '../components/catalog/CatalogPage';
import CatalogMasthead from '../components/catalog/CatalogMasthead';
import CollectionTiles from '../components/catalog/CollectionTiles';

// FE-003 — this page filtered and sorted on fields the schema does not have.
//
// The type filter read `item.category`, the sidebar's checkbox list was derived
// from the same field, "newest" sorted on `item.createdAt`, and the price
// ceiling was the literal `1000` — written into the state, into the slider's
// `max`, and into the percentage arithmetic that positions the track. Products
// are categorised by `tags`; "newest" is `date`, a number of epoch milliseconds;
// and the ceiling is a property of the catalog.
//
// FE-007 — the 121-line `ProductCard` that used to live at the top of this file
// is gone. It fabricated three images by repeating `image[0]` and read
// `product.vendor`, a field that has never existed.
//
// ---------------------------------------------------------------------------
// And the 460 lines that used to be below this comment are gone too.
// ---------------------------------------------------------------------------
//
// `/products` and a typed `/collections/:type` were two browse surfaces with
// two filter sidebars, two sort controls, two loading spinners, two empty
// states and two card variants between them — neither built to the design
// language the homepage established. Both render `components/catalog/CatalogPage`
// now. What stays here is what is genuinely this route's: its title, its
// description, its canonical and its breadcrumb, all of which differ per typed
// collection and none of which the shared shell could know.
//
// The filtering itself remains in `lib/catalog.js`, as pure functions over data.
//
// ---------------------------------------------------------------------------
// The bare route is a fourth thing now: a categories index.
// ---------------------------------------------------------------------------
//
// Unfiltered, `/products`, `/collections` and `/collections/all` used to render
// the same eyebrow, the same `<h1>` and the same chips — three addresses for one
// page, and the site had no page that actually let a visitor browse by
// category. `/collections/all` now redirects to `/products` (`App.jsx`); the
// bare `/collections` renders `CollectionTiles` instead of the full catalog.
// A typed `/collections/:type` is unchanged.

const Collections = () => {
    const { type } = useParams();
    const { tags, products } = useContext(ShopContext);

    // Same derivation as `CollectionTiles`, `About` and `CatalogPage` — the
    // tags endpoint the context already fetched, falling back to the tags the
    // loaded catalog carries. Only needed here for the index masthead's own
    // count; `CollectionTiles` derives the list it actually renders itself, so
    // this can never claim a total the tiles below it would contradict.
    const categoryCount = useMemo(
        () => (tags?.length > 0 ? tags.length : tagsOf(products).length),
        [tags, products],
    );

    if (!type) {
        return (
            <div className="min-h-screen bg-paper px-4 pb-24 text-ink sm:px-[5vw] md:px-[7vw] lg:px-[9vw]">
                <div className="mx-auto max-w-[1600px]">
                    <Seo
                        title="Collections"
                        description="Every Netronix collection: laptops, gaming PCs, MacBooks, audio and accessories."
                        path="/collections"
                        jsonLd={[
                            {
                                '@context': 'https://schema.org',
                                '@type': 'CollectionPage',
                                name: 'Collections',
                                url: absolute('/collections'),
                            },
                            breadcrumbLd([
                                { name: 'Home', path: '/' },
                                { name: 'Collections', path: '/collections' },
                            ]),
                        ]}
                    />

                    <CatalogMasthead
                        eyebrow="Netronix / Collections"
                        title="Collections"
                        description="Laptops, gaming PCs, MacBooks, audio and accessories — browse by category."
                        count={categoryCount}
                        countLabel={categoryCount === 1 ? 'category' : 'categories'}
                    />

                    <CollectionTiles />
                </div>
            </div>
        );
    }

    const named = type !== 'all' ? type : null;

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
                structured-data type this page can state as fact.
                `/collections/all` is dead code here now — `App.jsx` intercepts it
                before this branch ever runs — but the two component-test suites that
                mount their own `<Route path="/collections/:type">` still send it
                straight to this file, so it stays for them. It uses `named` rather
                than the raw `type`, so it no longer publishes itself under the
                title "all — Netronix": `named` is already `null` for `all`, and
                falls back to the same "Collections" the bare route uses. */}
            <Seo
                title={named ?? 'Collections'}
                description={
                    named
                        ? `Browse ${named} at Netronix — with real stock per variant.`
                        : 'Every Netronix collection: laptops, gaming PCs, MacBooks, audio and accessories.'
                }
                path={named ? `/collections/${named}` : '/collections'}
                jsonLd={[
                    breadcrumbLd(
                        named
                            ? [
                                { name: 'Home', path: '/' },
                                { name: 'Collections', path: '/collections' },
                                { name: named, path: `/collections/${named}` },
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
