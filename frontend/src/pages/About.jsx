import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

import { MINN_NAME, MINN_URL } from '../lib/minn.js';
import { CONTACT_EMAIL, buildMailto } from '../lib/contact';
import Seo from '../components/Seo';
import CollectionTiles from '../components/catalog/CollectionTiles';

// The About page, rebuilt — the same treatment Contact was given, for the same
// reasons.
//
// What was here was the house style of a generative tool: a solid `#6a5acd`
// hero with five tech glyphs drifting on `repeat: Infinity` loops, a decorative
// four-tile icon grid standing in for a photograph, eight more icon cards under
// matching drop shadows, two circles drifting behind the section, a bordered
// square rotating on a twelve-second cycle, and a CTA band whose background was
// a tiled SVG data URI animating its own `background-position`. Five infinite
// animations on a page nobody scrolls twice.
//
// The copy was the more serious half. It claimed:
//
//   * "Your Tech Partner Since 2025" and "founded in 2025" — a heritage claim
//     on a storefront whose own catalog is dated 2026. There is no history to
//     have;
//   * "same-day shipping on most in-stock items", "detailed tracking
//     information", an "optimized logistics network" — there is no shipping
//     system behind any of it. `PlaceOrder` collects an address and a payment
//     method, and that is the whole of what this application knows about
//     delivery;
//   * "rigorous testing", "comprehensive warranties", "certified professionals"
//     — unverifiable, and the last is close enough to the "team of experts"
//     phrasing that `minn-attribution-and-dead-links.test.jsx` already bans on
//     Contact;
//   * a category grid listing **Networking** and "Software & Security", which
//     the catalog does not stock. `e2e/storefront.spec.js` asserts the tag
//     filter offers no Networking, so the About page was advertising a
//     department the shop would then refuse to show.
//
// Everything below is either read from the running catalog or is a fact about
// code in this repository. The categories come from the context's own tag list,
// so they cannot drift from what is actually for sale; the payment methods are
// the two `PlaceOrder` renders; guest checkout is a real supported path.

const About = () => {
    const facts = [
        {
            term: 'Stock',
            detail: 'Counted per configuration, not per product. A 16-inch with 1 TB is a different line on the shelf from a 14-inch with 512 GB, and the page tells you which one is short before you reach the checkout.',
        },
        {
            term: 'Prices',
            detail: 'Shown per configuration in US dollars. The figure on the card is the figure for the options selected, so choosing more storage changes the price where you choose it rather than at the end.',
        },
        {
            term: 'Buying',
            detail: 'Checkout works without an account. An account keeps your order history and your wishlist; it is not a condition of ordering.',
        },
        {
            term: 'Payment',
            detail: 'Cash on delivery, or Whish. Both are chosen at checkout, and no card details are handled by this site.',
        },
    ];

    return (
        <div className="min-h-screen bg-paper px-4 pb-24 text-ink sm:px-[5vw] md:px-[7vw] lg:px-[9vw]">
            <Seo title="About" description="Who Netronix is, and what the shop sells." />

            <motion.div
                className="mx-auto max-w-[1200px]"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
                <header className="pt-[104px] md:pt-[132px]">
                    <div className="flex items-center gap-3">
                        <span className="font-michroma text-[9px] uppercase tracking-[0.22em] text-statepurp md:text-[10px]">
                            Netronix / About
                        </span>
                        <span className="h-px flex-1 bg-rule" />
                    </div>

                    <h1
                        className="mt-5 font-michroma uppercase leading-[0.95] tracking-tight text-ink"
                        style={{ fontSize: 'clamp(2.25rem, 7vw, 5rem)' }}
                    >
                        A computer shop.
                    </h1>

                    <p className="mt-8 max-w-[60ch] text-base leading-relaxed text-ink-60">
                        Netronix sells laptops, desktops and the things that go around them. Every
                        product page states the stock for the exact configuration you have chosen,
                        which is the part most storefronts leave until the checkout. There is no
                        membership, no newsletter wall, and nothing on this site claims a delivery
                        time it cannot keep.
                    </p>
                </header>

                {/* What is actually for sale, read from the catalog. */}
                <section className="mt-24" aria-labelledby="about-catalog">
                    <div className="flex items-center gap-3">
                        <h2 id="about-catalog" className="font-michroma text-[10px] uppercase tracking-[0.2em] text-ink">
                            What we stock
                        </h2>
                        <span className="h-px flex-1 bg-rule" />
                    </div>

                    <CollectionTiles />
                </section>

                {/* How the shop works — each row a fact about this application. */}
                <section className="mt-24" aria-labelledby="about-how">
                    <div className="flex items-center gap-3">
                        <h2 id="about-how" className="font-michroma text-[10px] uppercase tracking-[0.2em] text-ink">
                            How buying works
                        </h2>
                        <span className="h-px flex-1 bg-rule" />
                    </div>

                    <dl className="mt-4 max-w-[74ch] divide-y divide-rule">
                        {facts.map((fact) => (
                            <div key={fact.term} className="flex flex-col gap-2 py-6 md:flex-row md:gap-10">
                                <dt className="w-32 shrink-0 font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40">
                                    {fact.term}
                                </dt>
                                <dd className="text-sm leading-relaxed text-ink-60">{fact.detail}</dd>
                            </div>
                        ))}
                    </dl>
                </section>

                {/* Who built it. The URL lives in one module (`lib/minn.js`), which
                    is what the Footer, the newsletter rail and Contact all use. */}
                <section className="mt-24 border-t border-rule pt-10" aria-labelledby="about-minn">
                    <h2 id="about-minn" className="font-michroma text-[10px] uppercase tracking-[0.2em] text-ink">
                        Built by {MINN_NAME}
                    </h2>
                    <p className="mt-5 max-w-[60ch] text-sm leading-relaxed text-ink-60">
                        This storefront, its admin console and its API were designed and built by{' '}
                        <a
                            href={MINN_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rule-draw pb-0.5 text-ink transition-colors hover:text-statepurp"
                        >
                            {MINN_NAME}
                        </a>
                        , the agency behind this storefront. Its address is{' '}
                        <a
                            href={buildMailto({ to: CONTACT_EMAIL, subject: 'Question about Netronix' })}
                            className="rule-draw pb-0.5 text-ink transition-colors hover:text-statepurp"
                        >
                            {CONTACT_EMAIL}
                        </a>
                        .
                    </p>

                    <div className="mt-10 flex flex-wrap gap-3">
                        {/* `/products` is the whole catalog now — `/collections/all` was a
                            fourth address for the same page and is gone (Phase 1). */}
                        <Link
                            to="/products"
                            className="border border-ink bg-ink px-8 py-3.5 font-michroma text-[10px] uppercase tracking-[0.18em] text-paper transition-colors duration-300 hover:border-statepurp hover:bg-statepurp"
                        >
                            Browse the catalog
                        </Link>
                        <Link
                            to="/contact"
                            className="border border-rule px-8 py-3.5 font-michroma text-[10px] uppercase tracking-[0.18em] text-ink transition-colors duration-300 hover:border-ink"
                        >
                            Contact
                        </Link>
                    </div>
                </section>
            </motion.div>
        </div>
    );
};

export default About
