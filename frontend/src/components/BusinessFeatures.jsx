import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

import { CONTACT_EMAIL, buildMailto } from '../lib/contact';

/**
 * The strip above the footer — rewritten, because half of it was untrue.
 *
 * `Footer` renders this and `App` mounts `Footer` outside `<Routes>`, so these
 * four claims appear on **every page of the site, including the 404**. Two of
 * them were promises nothing in this codebase can keep:
 *
 *   * "Get help with products, orders, delivery, and **returns**" — there is no
 *     returns process. Not an unimplemented one; there is no concept of a return
 *     anywhere in the API, the models or the admin console.
 *   * "**Confirm delivery availability and timing** before placing an order" —
 *     nothing can confirm this. `PlaceOrder` collects an address and a payment
 *     method, and that is the whole of what this application knows about
 *     delivery.
 *
 * The other two were vague rather than false ("find the right technology for
 * your setup", "the payment methods available at checkout"), which on a strip
 * this prominent is its own kind of filler.
 *
 * All four are replaced by things that are *checkably* true of this build: the
 * per-configuration stock the product page really shows, the guest checkout the
 * router really allows, the two payment methods `PlaceOrder` really renders, and
 * the one address a person really reads. Each links to where it can be verified.
 *
 * The icons went with the copy. Four glyphs at `#6a5acd` above four headings was
 * the decoration standing in for the substance; the strip is now a rule-divided
 * row of four statements, on the same tokens as the rest of the site.
 */
const features = [
    {
        title: 'Stock by configuration',
        description:
            'The count shown is for the exact options selected — a 1 TB 16-inch is a different line on the shelf from a 512 GB 14-inch.',
        // `/products` is the whole catalog; `/collections/all` was a fourth
        // address for the same page and now redirects here (Phase 1).
        to: '/products',
        linkLabel: 'Browse the catalog',
    },
    {
        title: 'No account needed',
        description:
            'Checkout works signed out. An account keeps your order history and your wishlist; it is not a condition of ordering.',
        to: '/cart',
        linkLabel: 'View your bag',
    },
    {
        title: 'Cash on delivery or Whish',
        description:
            'Both are chosen at checkout. No card details are collected by this site, at any point.',
        to: '/about',
        linkLabel: 'How buying works',
    },
    {
        title: 'One address',
        description: `Written questions go to ${CONTACT_EMAIL}. There is no queue and no ticket number.`,
        href: buildMailto({ to: CONTACT_EMAIL, subject: 'Netronix — question' }),
        linkLabel: 'Write to us',
    },
];

/**
 * Which edges each cell draws, per breakpoint.
 *
 * The old strip used `border-r ... last:border-r-0`, which is only correct while
 * every cell is in one row. At `md:grid-cols-2` the *second* cell is not the
 * last child, so it kept a divider hard against the grid's right edge — a rule
 * drawn on the outside of the layout.
 *
 * `divide-x` / `divide-y` cannot express this either: they key off DOM order,
 * not grid position, so in a two-column grid they put a top border on the second
 * cell, which is in the first row. The four cases are written out instead. One
 * row of four at `lg`, two rows of two at `md`, a single column below that.
 */
const EDGES = [
    '',
    'border-t border-rule md:border-t-0 md:border-l lg:border-l',
    'border-t border-rule lg:border-t-0 lg:border-l',
    'border-t border-rule md:border-l lg:border-t-0 lg:border-l',
];

const FeatureCard = ({ title, description, to, href, linkLabel, edges }) => (
    <div className={`flex flex-col px-6 py-7 ${edges}`}>
        <h3 className="font-michroma text-[10px] uppercase tracking-[0.16em] text-ink">{title}</h3>
        <p className="mt-3 max-w-[38ch] flex-1 text-sm leading-relaxed text-ink-60">{description}</p>

        {href ? (
            <a
                href={href}
                className="mt-4 self-start text-xs text-ink-40 transition-colors hover:text-statepurp"
            >
                {linkLabel} &#8599;
            </a>
        ) : (
            <Link
                to={to}
                className="mt-4 self-start text-xs text-ink-40 transition-colors hover:text-statepurp"
            >
                {linkLabel} &#8599;
            </Link>
        )}
    </div>
);

FeatureCard.propTypes = {
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    /** A router destination, for the three that stay inside the site. */
    to: PropTypes.string,
    /** A mailto, for the one that does not. */
    href: PropTypes.string,
    linkLabel: PropTypes.string.isRequired,
    /** The border classes for this cell's position in the grid. */
    edges: PropTypes.string.isRequired,
};

const BusinessFeatures = () => (
    <section
        className="w-full border-t border-rule bg-paper text-ink"
        aria-labelledby="business-features"
    >
        <h2 id="business-features" className="sr-only">
            How this shop works
        </h2>

        <div className="mx-auto grid max-w-[1400px] grid-cols-1 px-4 py-4 sm:px-[3vw] md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, index) => (
                <FeatureCard key={feature.title} {...feature} edges={EDGES[index]} />
            ))}
        </div>
    </section>
);

export default BusinessFeatures;
