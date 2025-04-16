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
            <footer className="bg-gradient-to-r  from-black to-[#1C1C1C] text-white ">
                <div>
                    <div className="pt-24 pb-20 rounded-b-[2rem] bg-gradient-to-r from-[#000000] to-[#434343]">
                        <div className="ml-32 mr-32 grid grid-cols-1 md:grid-cols-[1fr_1fr_2fr] gap-8 ] ">
                            {/* Collections */}
                            <div>
                                <h2 className="text-xl font-michroma mb-8">Collections</h2>
                                <ul className="space-y-3 mb-12">
                                    <li><a href="#" className="text-base hover:text-gray-300 transition-colors">Headphones</a></li>
                                    <li><a href="#" className="text-base hover:text-gray-300 transition-colors">Earphones</a></li>
                                    <li><a href="#" className="text-base hover:text-gray-300 transition-colors">Speakers</a></li>
                                    <li><a href="#" className="text-base hover:text-gray-300 transition-colors">Accessories</a></li>
                                </ul>

                                <div className="space-y-2">
                                    <a href="tel:+21(0)98765432" className="block text-xl hover:text-gray-300 transition-colors">+961 81 995 653</a>
                                    <a href="mailto:hello@domain.com" className="block text-xl hover:text-gray-300 transition-colors underline">support@netronix.com</a>
                                </div>
                            </div>

                            {/* Information */}
                            <div className='shadow-[0.5px_0_0_0_grey]'>
                                <h2 className="text-xl font-michroma mb-8">Information</h2>
                                <ul className="space-y-3">
                                    <li><a href="#" className="text-base hover:text-gray-300 transition-colors">Our Story</a></li>
                                    <li><a href="#" className="text-base hover:text-gray-300 transition-colors">Our Journal</a></li>
                                    <li><a href="#" className="text-base hover:text-gray-300 transition-colors">FAQs</a></li>
                                    <li><a href="#" className="text-base hover:text-gray-300 transition-colors">Contact Us</a></li>
                                </ul>
                            </div>

                            {/* Newsletter */}
                            <div className='flex flex-col mx-16'>
                                {/* Logo */}
                                <div className='flex flex-col'>
                                    <img src='https://cdn.prod.website-files.com/67ccd759c5839fca18ed2c8f/67ccde31189939f4c5cd0722_Netronix%20Logo%20black.png' alt="Logo" className="w-56 mb-8 brightness-0 invert" />
                                </div>
                                <h2 className="text-[2rem] leading-tight font-michroma mb-8">Stay in the loop with<br />our weekly newsletter</h2>
                                <div className="flex gap-2 mb-8">
                                    <input
                                        type="email"
                                        placeholder="Enter your email"
                                        className="flex-1 bg-[#1C1C1C] rounded-full px-6 py-4 text-lg focus:outline-none"
                                    />
                                    <button className="bg-white text-black rounded-full w-14 h-14 flex items-center justify-center hover:bg-gray-200 transition-colors">
                                        <HiArrowRight className="w-6 h-6" />
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
                    <div className="mt-3 px-2 sm:px-8 md:px-16 lg:px-32 pb-3 bg-gradient-to-r from-black to-[#1C1C1C]">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center">
                            <div className="text-sm text-gray-400 text-center sm:text-left">
                                © 2025 Netronix <a href="#" className="underline hover:text-white">Powered by Basically Coders</a>
                            </div>

                            <div className="flex justify-center gap-6">
                                <button className="text-sm text-gray-400 hover:text-white">English</button>
                                <button className="text-sm text-gray-400 hover:text-white">Lebanon (LBP ل.ل)</button>
                            </div>

                            <div className="flex justify-center sm:justify-end items-center gap-6">
                                <img src={wishLogo} alt="Wish" className="h-5" />
                                <img src={codLogo} alt="Cash On Delivery" className="h-[58px] brightness-0 invert object-contain" style={{ verticalAlign: 'middle' }} />
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    );
};

export default Footer;