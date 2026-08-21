import { Link, useNavigate } from 'react-router-dom';
import { FaFacebookF, FaInstagram, FaYoutube, FaXTwitter } from 'react-icons/fa6';
import { HiArrowRight } from 'react-icons/hi';
import BusinessFeatures from './BusinessFeatures';
import wishLogo from '../assets/all/whishLogo.png';
import codLogo from '../assets/all/cash-on-delivery.svg';
import BrandLogo from './BrandLogo';

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

                                <div className="space-y-2">
                                    <a href="tel:+96181995653" className="block text-base md:text-xl hover:text-gray-300 transition-colors">+961 81 995 653</a>
                                    <a href="mailto:support@netronix.com" className="block text-base md:text-xl hover:text-gray-300 transition-colors underline">support@netronix.com</a>
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
                                    <li>
                                        <Link 
                                            to="/about" 
                                            onClick={(e) => { e.preventDefault(); handleNavigation('/about'); }} 
                                            className="text-sm md:text-base hover:text-gray-300 transition-colors"
                                        >
                                            FAQs
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

                            {/* Newsletter */}
                            <div className="sm:col-span-2 lg:col-span-1 flex flex-col px-0 sm:px-4 md:px-8 lg:px-12">
                                {/* Logo */}
                                <div className="flex flex-col items-start">
                                    <BrandLogo className="w-40 sm:w-48 md:w-56 mb-6 sm:mb-8 text-white" />
                                </div>
                                <h2 className="text-xl sm:text-2xl md:text-[2rem] leading-tight font-michroma mb-6 sm:mb-8">
                                    Stay in the loop with<br />our weekly newsletter
                                </h2>
                                {/* A11Y-009 — the email field had a placeholder
                                    and nothing else: no `<label>`, no
                                    `aria-label`, so a screen reader announced
                                    an unnamed text box, and the submit button
                                    was an unnamed arrow icon.

                                    Both are named now. Whether this form does
                                    anything at all is FE-016 / PORT-006, which
                                    is Phase 5's — labelling an inert control is
                                    still better than leaving it anonymous. */}
                                <div className="flex gap-2 mb-6 sm:mb-8">
                                    <label htmlFor="newsletter-email" className="sr-only">Your email address</label>
                                    <input
                                        id="newsletter-email"
                                        name="newsletter-email"
                                        type="email"
                                        autoComplete="email"
                                        placeholder="Enter your email"
                                        className="flex-1 bg-[#1C1C1C] rounded-full px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg focus:outline-none"
                                    />
                                    <button
                                        type="button"
                                        aria-label="Subscribe to the newsletter"
                                        className="bg-white text-black rounded-full w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center hover:bg-gray-200 transition-colors"
                                    >
                                        <HiArrowRight aria-hidden="true" className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </button>
                                </div>

                                <div className="flex gap-6">
                                    <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" aria-label="Facebook" className="text-lg hover:text-gray-300 transition-colors flex items-center justify-center w-10 h-10 rounded-full  hover:bg-[#6a5acd]">
                                        <FaFacebookF />
                                    </a>
                                    <a href="https://x.com" target="_blank" rel="noopener noreferrer" aria-label="X" className="text-lg hover:text-gray-300 transition-colors flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#6a5acd]">
                                        <FaXTwitter />
                                    </a>
                                    <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="text-lg hover:text-gray-300 transition-colors flex items-center justify-center w-10 h-10 rounded-full  hover:bg-[#6a5acd]">
                                        <FaInstagram />
                                    </a>
                                    <a href="https://youtube.com" target="_blank" rel="noopener noreferrer" aria-label="YouTube" className="text-lg hover:text-gray-300 transition-colors flex items-center justify-center w-10 h-10 rounded-full hover:bg-[#6a5acd]">
                                        <FaYoutube />
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Bottom Section */}
                    <div className="mt-3 px-4 sm:px-8 md:px-16 lg:px-32 py-4 sm:py-3 bg-gradient-to-r from-black to-[#1C1C1C]">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 items-center">
                            <div className="text-xs sm:text-sm text-gray-400 text-center sm:text-left order-3 sm:order-1">
                                © 2025 Netronix <Link to="/" className="underline hover:text-white">Powered by Basically Coders</Link>
                            </div>

                            <div className="flex justify-center gap-4 sm:gap-6 order-2">
                                <button type="button" className="text-xs sm:text-sm text-gray-400 hover:text-white px-2 py-1 ">English</button>
                                <button type="button" className="text-xs sm:text-sm text-gray-400 hover:text-white px-2 py-1 ">Lebanon (LBP ل.ل)</button>
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