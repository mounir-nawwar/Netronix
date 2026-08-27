import { useContext, useMemo } from 'react';
import { Link } from 'react-router-dom';

import { ShopContext } from '../../context/shopContext';
import { collectionPath, filterProducts, tagsOf } from '../../lib/catalog';

// Lifted out of `About.jsx`, which had this grid inline before `/collections`
// had anywhere of its own to put it. Two call sites building the same tile
// list is the same defect shape as the four product cards (FE-007) — one
// component now, used by both.

const CollectionTiles = () => {
    const { tags, products } = useContext(ShopContext);

    // The real taxonomy, the same way `About` and `CatalogPage` both derive
    // it: the tags endpoint the context already fetched, falling back to the
    // tags the loaded catalog carries. Never a written-down list — that is
    // exactly how the old About page ended up advertising a "Networking"
    // category the catalog has never stocked (FE-010).
    const categories = useMemo(
        () => (tags?.length > 0 ? [...tags].sort() : tagsOf(products)),
        [tags, products],
    );

    if (categories.length === 0) {
        return (
            <p className="mt-8 text-sm text-ink-60">
                The catalog is loading. <Link to="/products" className="rule-draw pb-0.5 text-ink">Browse everything</Link>.
            </p>
        );
    }

    return (
        <ul className="mt-8 grid grid-cols-2 gap-px border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => {
                // A count per tile is the one fact that makes it more than a
                // label, and it costs nothing extra: `filterProducts` is the
                // same function the grid itself filters with, so a tile can
                // never claim a count the grid it links to would contradict.
                const count = filterProducts(products, { type: category }).length;
                return (
                    <li key={category} className="bg-paper">
                        <Link
                            to={collectionPath(category)}
                            className="group flex min-h-[104px] flex-col justify-end p-5 transition-colors hover:bg-wash"
                        >
                            <span className="font-michroma text-[10px] uppercase tracking-[0.16em] text-ink md:text-[11px]">
                                {category}
                            </span>
                            <span className="mt-2 text-xs text-ink-40 transition-colors group-hover:text-statepurp">
                                {count} {count === 1 ? 'product' : 'products'} &#8599;
                            </span>
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
};

export default CollectionTiles;
