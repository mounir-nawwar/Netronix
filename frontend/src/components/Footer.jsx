import React from 'react';
import { FaFacebookF, FaTwitter, FaInstagram, FaYoutube } from 'react-icons/fa';
import { HiArrowRight } from 'react-icons/hi';
import BusinessFeatures from './BusinessFeatures';
import wishLogo from '../assets/all/whishLogo.png';
import codLogo from '../assets/all/cash-on-delivery.svg';

const Footer = () => {
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
                                    <li><a href="#" className="text-sm md:text-base hover:text-gray-300 transition-colors">Headphones</a></li>
                                    <li><a href="#" className="text-sm md:text-base hover:text-gray-300 transition-colors">Earphones</a></li>
                                    <li><a href="#" className="text-sm md:text-base hover:text-gray-300 transition-colors">Speakers</a></li>
                                    <li><a href="#" className="text-sm md:text-base hover:text-gray-300 transition-colors">Accessories</a></li>
                                </ul>

                                <div className="space-y-2">
                                    <a href="tel:+21(0)98765432" className="block text-base md:text-xl hover:text-gray-300 transition-colors">+961 81 995 653</a>
                                    <a href="mailto:hello@domain.com" className="block text-base md:text-xl hover:text-gray-300 transition-colors underline">support@netronix.com</a>
                                </div>
                            </div>

                            {/* Information */}
                            <div className="sm:pl-4 md:pl-6 mb-6 sm:mb-0 sm:border-l sm:border-gray-700">
                                <h2 className="text-lg md:text-xl font-michroma mb-4 sm:mb-6 md:mb-8">Information</h2>
                                <ul className="space-y-2 sm:space-y-3">
                                    <li><a href="#" className="text-sm md:text-base hover:text-gray-300 transition-colors">Our Story</a></li>
                                    <li><a href="#" className="text-sm md:text-base hover:text-gray-300 transition-colors">Our Journal</a></li>
                                    <li><a href="#" className="text-sm md:text-base hover:text-gray-300 transition-colors">FAQs</a></li>
                                    <li><a href="#" className="text-sm md:text-base hover:text-gray-300 transition-colors">Contact Us</a></li>
                                </ul>
                            </div>

                            {/* Newsletter */}
                            <div className="sm:col-span-2 lg:col-span-1 flex flex-col px-0 sm:px-4 md:px-8 lg:px-12">
                                {/* Logo */}
                                <div className="flex flex-col items-start">
                                    <img 
                                        src='https://cdn.prod.website-files.com/67ccd759c5839fca18ed2c8f/67ccde31189939f4c5cd0722_Netronix%20Logo%20black.png' 
                                        alt="Logo" 
                                        className="w-40 sm:w-48 md:w-56 mb-6 sm:mb-8 brightness-0 invert" 
                                    />
                                </div>
                                <h2 className="text-xl sm:text-2xl md:text-[2rem] leading-tight font-michroma mb-6 sm:mb-8">
                                    Stay in the loop with<br />our weekly newsletter
                                </h2>
                                <div className="flex gap-2 mb-6 sm:mb-8">
                                    <input
                                        type="email"
                                        placeholder="Enter your email"
                                        className="flex-1 bg-[#1C1C1C] rounded-full px-4 sm:px-6 py-3 sm:py-4 text-base sm:text-lg focus:outline-none"
                                    />
                                    <button className="bg-white text-black rounded-full w-12 h-12 sm:w-14 sm:h-14 flex items-center justify-center hover:bg-gray-200 transition-colors">
                                        <HiArrowRight className="w-5 h-5 sm:w-6 sm:h-6" />
                                    </button>
                                </div>

                                <div className="flex gap-6">
                                    <a href="#" className="text-lg hover:text-gray-300 transition-colors"><FaFacebookF /></a>
                                    <a href="#" className="text-lg hover:text-gray-300 transition-colors"><FaTwitter /></a>
                                    <a href="#" className="text-lg hover:text-gray-300 transition-colors"><FaInstagram /></a>
                                    <a href="#" className="text-lg hover:text-gray-300 transition-colors"><FaYoutube /></a>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Bottom Section */}
                    <div className="mt-3 px-4 sm:px-8 md:px-16 lg:px-32 py-4 sm:py-3 bg-gradient-to-r from-black to-[#1C1C1C]">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 items-center">
                            <div className="text-xs sm:text-sm text-gray-400 text-center sm:text-left order-3 sm:order-1">
                                © 2025 Netronix <a href="#" className="underline hover:text-white">Powered by Basically Coders</a>
                            </div>

                            <div className="flex justify-center gap-4 sm:gap-6 order-2">
                                <button className="text-xs sm:text-sm text-gray-400 hover:text-white">English</button>
                                <button className="text-xs sm:text-sm text-gray-400 hover:text-white">Lebanon (LBP ل.ل)</button>
                            </div>

                            <div className="flex justify-center sm:justify-end items-center gap-4 sm:gap-6 mb-4 sm:mb-0 order-1 sm:order-3">
                                <img src={wishLogo} alt="Wish" className="h-4 sm:h-5" />
                                <img src={codLogo} alt="Cash On Delivery" className="h-[42px] sm:h-[58px] brightness-0 invert object-contain" style={{ verticalAlign: 'middle' }} />
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    );
};

export default Footer;