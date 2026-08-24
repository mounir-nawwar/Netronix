import { Link, useNavigate } from 'react-router-dom';
import { FaFacebookF, FaInstagram, FaXTwitter } from 'react-icons/fa6';
import BusinessFeatures from './BusinessFeatures';
import wishLogo from '../assets/all/whishLogo.png';
import codLogo from '../assets/all/cash-on-delivery.svg';
import minnWordmark from '../assets/logos/minn-wordmark-light.svg';
import BrandLogo from './BrandLogo';
import { MINN_NAME, MINN_SOCIAL_LINKS, MINN_URL } from '../lib/minn.js';
import { PHONE_DISPLAY, PHONE_HREF, SUPPORT_EMAIL } from '../lib/contact.js';

const SOCIAL_ICONS = {
    facebook: FaFacebookF,
    twitter: FaXTwitter,
    instagram: FaInstagram,
};

const Footer = () => {
    const navigate = useNavigate();

    // Handler for navigation to maintain consistent behavior
    const handleNavigation = (path) => {
        // Ensure body scroll is restored
        document.body.style.overflow = 'auto';
        
        // Navigate to the path
        navigate(path);
    };

    return (
        <>
            <BusinessFeatures />
            <footer className="bg-gradient-to-r from-black to-[#1C1C1C] text-white">
                <div>
                    <div className="pt-12 sm:pt-16 md:pt-24 pb-10 sm:pb-16 md:pb-20 rounded-b-[2rem] bg-gradient-to-r from-[#000000] to-[#434343]">
                        <div className="px-6 sm:px-10 md:px-16 lg:px-32 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr] gap-8 md:gap-10">
                            {/* Collections */}
                            <div className="mb-6 sm:mb-0">
                                <h2 className="text-lg md:text-xl font-michroma mb-4 sm:mb-6 md:mb-8">Collections</h2>
                                <ul className="space-y-2 sm:space-y-3 mb-6 sm:mb-8 md:mb-12">
                                    <li>
                                        <Link 
                                            to="/products?tag=Headphones" 
                                            onClick={(e) => { e.preventDefault(); handleNavigation('/products?tag=Headphones'); }} 
                                            className="text-sm md:text-base hover:text-gray-300 transition-colors"
                                        >
                                            Headphones
                                        </Link>
                                    </li>
                                    <li>
                                        <Link 
                                            to="/products?tag=Earphones" 
                                            onClick={(e) => { e.preventDefault(); handleNavigation('/products?tag=Earphones'); }} 
                                            className="text-sm md:text-base hover:text-gray-300 transition-colors"
                                        >
                                            Earphones
                                        </Link>
                                    </li>
                                    <li>
                                        <Link 
                                            to="/products?tag=Speakers" 
                                            onClick={(e) => { e.preventDefault(); handleNavigation('/products?tag=Speakers'); }} 
                                            className="text-sm md:text-base hover:text-gray-300 transition-colors"
                                        >
                                            Speakers
                                        </Link>
                                    </li>
                                    <li>
                                        <Link 
                                            to="/products?tag=Accessories" 
                                            onClick={(e) => { e.preventDefault(); handleNavigation('/products?tag=Accessories'); }} 
                                            className="text-sm md:text-base hover:text-gray-300 transition-colors"
                                        >
                                            Accessories
                                        </Link>
                                    </li>
                                </ul>

                                {/* The footer and Contact used different support
                                    addresses. The Contact page's `.tech` address
                                    is now the one shared source of truth. */}
                                <div className="space-y-2">
                                    <a href={PHONE_HREF} className="block text-base md:text-xl hover:text-gray-300 transition-colors">{PHONE_DISPLAY}</a>
                                    <a href={`mailto:${SUPPORT_EMAIL}`} className="block text-base md:text-xl hover:text-gray-300 transition-colors underline">{SUPPORT_EMAIL}</a>
                                </div>
                            </div>

                            {/* Information */}
                            <div className="sm:pl-4 md:pl-6 mb-6 sm:mb-0 sm:border-l sm:border-gray-700">
                                <h2 className="text-lg md:text-xl font-michroma mb-4 sm:mb-6 md:mb-8">Information</h2>
                                <ul className="space-y-2 sm:space-y-3">
                                    <li>
                                        <Link 
                                            to="/about" 
                                            onClick={(e) => { e.preventDefault(); handleNavigation('/about'); }} 
                                            className="text-sm md:text-base hover:text-gray-300 transition-colors"
                                        >
                                            Our Story
                                        </Link>
                                    </li>
                                    <li>
                                        <Link 
                                            to="/products" 
                                            onClick={(e) => { e.preventDefault(); handleNavigation('/products'); }} 
                                            className="text-sm md:text-base hover:text-gray-300 transition-colors"
                                        >
                                            Our Products
                                        </Link>
                                    </li>
                                    {/* FE-014 — this slot said "FAQs" and went
                                        to `/about`, which is Our Story one line
                                        above it and contains no questions and
                                        no answers. There is no FAQ page to
                                        point it at, so rather than keep a label
                                        that lies about where it leads, the slot
                                        holds a route that does exist. */}
                                    <li>
                                        <Link 
                                            to="/collections"
                                            onClick={(e) => { e.preventDefault(); handleNavigation('/collections'); }}
                                            className="text-sm md:text-base hover:text-gray-300 transition-colors"
                                        >
                                            Collections
                                        </Link>
                                    </li>
                                    <li>
                                        <Link 
                                            to="/contact" 
                                            onClick={(e) => { e.preventDefault(); handleNavigation('/contact'); }} 
                                            className="text-sm md:text-base hover:text-gray-300 transition-colors"
                                        >
                                            Contact Us
                                        </Link>
                                    </li>
                                </ul>
                            </div>

                            {/* Call to action */}
                            <div className="sm:col-span-2 lg:col-span-1 flex flex-col px-0 sm:px-4 md:px-8 lg:px-12">
                                {/* Logo */}
                                <div className="flex flex-col items-start">
                                    <BrandLogo className="w-40 sm:w-48 md:w-56 mb-6 sm:mb-8 brightness-0 invert opacity-90" />
                                </div>
                                {/* FE-016 / PORT-006 — this column used to
                                    promise a weekly newsletter and collect an
                                    address for it with an email field and an
                                    arrow button. Neither was wired to anything:
                                    the button had no handler, so a visitor who
                                    typed their address and pressed it got no
                                    request, no confirmation and no newsletter.
                                    There is no mailing list to sign up to.

                                    Phase 4 named the field and the button
                                    (A11Y-009), which was the right fix for an
                                    anonymous control and the wrong fix for an
                                    imaginary one. The two things Netronix can
                                    actually do for a visitor at this point in
                                    the page take its place. */}
                                <h2 className="text-xl sm:text-2xl md:text-[2rem] leading-tight font-michroma mb-6 sm:mb-8">
                                    Everything you need,<br />in one place
                                </h2>
                                <div className="flex flex-wrap gap-3 sm:gap-4 mb-6 sm:mb-8">
                                    <Link
                                        to="/products"
                                        onClick={(e) => { e.preventDefault(); handleNavigation('/products'); }}
                                        className="bg-white text-black rounded-full px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base hover:bg-gray-200 transition-colors"
                                    >
                                        Shop all products
                                    </Link>
                                    <Link
                                        to="/contact"
                                        onClick={(e) => { e.preventDefault(); handleNavigation('/contact'); }}
                                        className="border border-white/40 rounded-full px-6 sm:px-8 py-3 sm:py-4 text-sm sm:text-base hover:bg-white/10 transition-colors"
                                    >
                                        Contact us
                                    </Link>
                                </div>

                                {/* FE-014 — these four icons went to
                                    facebook.com, x.com, instagram.com and
                                    youtube.com: the platforms' own front pages,
                                    not anybody's account. They are MINN's
                                    accounts, so they say so in their accessible
                                    names, and YouTube is gone because there is
                                    no MINN YouTube channel to link to. */}
                                <h3 className="sr-only">Follow {MINN_NAME}</h3>
                                <div className="flex gap-6">
                                    {MINN_SOCIAL_LINKS.map(({ platform, url, label }) => {
                                        const Icon = SOCIAL_ICONS[platform];
                                        return (
                                            <a
                                                key={platform}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                aria-label={label}
                                                className="text-lg hover:text-gray-300 transition-colors flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#6a5acd]"
                                            >
                                                <Icon aria-hidden="true" />
                                            </a>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Bottom Section */}
                    <div className="mt-3 px-4 sm:px-8 md:px-16 lg:px-32 py-4 sm:py-3 bg-gradient-to-r from-black to-[#1C1C1C]">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 items-center">
                            {/* FE-014 — the credit read "Powered by Basically
                                Coders" and linked to `/`, so it named a party
                                who did not build this and sent anyone curious
                                back to the homepage. The site is built by MINN;
                                the credit says so and goes to MINN. The
                                wordmark is deliberately small and set beneath
                                the Netronix mark above — an attribution, not a
                                second brand. */}
                            <div className="text-xs sm:text-sm text-gray-400 text-center sm:text-left order-3 sm:order-1">
                                <span className="block sm:inline">© {new Date().getFullYear()} Netronix</span>
                                <a
                                    href={MINN_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label={`Built by ${MINN_NAME} — opens MINN Agency website`}
                                    className="mt-2 sm:mt-0 sm:ml-3 inline-flex items-center gap-2 align-middle hover:text-white transition-colors group"
                                >
                                    <span>Built by</span>
                                    <img
                                        src={minnWordmark}
                                        alt={`${MINN_NAME} — MINN Agency`}
                                        loading="lazy"
                                        decoding="async"
                                        className="h-2.5 sm:h-3 w-auto opacity-70 group-hover:opacity-100 transition-opacity"
                                    />
                                </a>
                            </div>

                            {/* FE-014 — "English" and "Lebanon (LBP ل.ل)" were
                                `<button>`s with no handlers: there is one
                                language and prices are held in USD minor units
                                end to end. Buttons that cannot do anything are
                                now the plain statement of fact they always
                                were. */}
                            <div className="flex justify-center gap-4 sm:gap-6 order-2">
                                <span className="text-xs sm:text-sm text-gray-400 px-2 py-1">English</span>
                                <span className="text-xs sm:text-sm text-gray-400 px-2 py-1">Prices in USD</span>
                            </div>

                            <div className="flex justify-center sm:justify-end items-center gap-4 sm:gap-6 mb-4 sm:mb-0 order-1 sm:order-3">
                                {/* PERF-003 — the payment marks are at the very
                                    bottom of every page and were fetched at
                                    full priority during the first load, ahead
                                    of content the visitor can actually see.
                                    They keep their intrinsic dimensions, so
                                    deferring them shifts nothing. */}
                                <img src={wishLogo} alt="Whish Money accepted" width={254} height={91} loading="lazy" decoding="async" className="h-4 sm:h-5 w-auto" />
                                <img src={codLogo} alt="Cash on delivery accepted" width={120} height={58} loading="lazy" decoding="async" className="h-[42px] sm:h-[58px] w-auto brightness-0 invert object-contain" style={{ verticalAlign: 'middle' }} />
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    );
};

export default Footer;
