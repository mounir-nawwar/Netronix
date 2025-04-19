import React, { useContext, useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ShopContext } from '../context/ShopContext';
import { IoPersonOutline } from "react-icons/io5";
import { BsCartDash } from "react-icons/bs";
import { IoSearchOutline } from "react-icons/io5";
import { CiMenuBurger } from "react-icons/ci";
import { IoCloseOutline } from "react-icons/io5";
import { FiUser, FiShoppingBag, FiLogOut, FiChevronDown, FiHeart } from "react-icons/fi";
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';

const Navbar = ({ visible }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
    const { setShowSearch, getCartCount, navigate, token, setToken, setCartItems, backendUrl } = useContext(ShopContext);
    const [tags, setTags] = useState([]);
    const dropdownRef = useRef(null);
    const mobileMenuRef = useRef(null);
    const profileDropdownRef = useRef(null);
    
    // Featured tags to display in navigation
    const featuredTags = ["Laptops", "Desktops", "Components", "Peripherals", "Accessories", "Gaming"];

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setDropdownOpen(false);
            }
            if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target) && 
                !event.target.closest('.menu-trigger')) {
                setMobileMenuOpen(false);
            }
            if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target) && 
                !event.target.closest('.profile-trigger')) {
                setProfileDropdownOpen(false);
            }
        };
        
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [dropdownRef, mobileMenuRef, profileDropdownRef]);

    // Prevent body scroll when mobile menu is open
    useEffect(() => {
        if (mobileMenuOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'auto';
        }
        
        return () => {
            document.body.style.overflow = 'auto';
        };
    }, [mobileMenuOpen]);

    // Fetch all available tags
    const fetchTags = async () => {
        try {
            const response = await axios.get(`${backendUrl}/api/product/tags`);
            if (response.data.success) {
                setTags(response.data.tags);
            }
        } catch (error) {
            console.error("Error fetching tags:", error);
        }
    };

    useEffect(() => {
        fetchTags();
    }, []);

    const logout = () => {
        localStorage.removeItem('token')
        setToken('')
        setCartItems({})
        navigate("/login");
    }

    // Handle navigation and ensure proper cleanup
    const handleNavigation = (path, closeMenu = true) => {
        // Close appropriate menus
        if (closeMenu) {
            setDropdownOpen(false);
            setMobileMenuOpen(false);
            setProfileDropdownOpen(false);
        }
        
        // Ensure body scroll is restored
        document.body.style.overflow = 'auto';
        
        // Navigate to the path
        navigate(path);
    };

    // Animation variants for mobile menu
    const menuVariants = {
        hidden: { 
            opacity: 0,
            y: "-100%",
            borderRadius: "0 0 30px 30px",
        },
        visible: { 
            opacity: 1,
            y: 0,
            borderRadius: "0 0 30px 30px",
            transition: { 
                type: "spring", 
                stiffness: 300, 
                damping: 24,
                mass: 0.9
            }
        },
        exit: { 
            opacity: 0,
            y: "-100%",
            transition: { 
                duration: 0.3, 
                ease: "easeInOut" 
            }
        }
    };

    // Animation variants for menu items
    const listItemVariants = {
        hidden: { opacity: 0, y: -10 },
        visible: (i) => ({ 
            opacity: 1, 
            y: 0,
            transition: { 
                delay: i * 0.05,
                duration: 0.3
            }
        })
    };

    // Profile dropdown animation variants
    const profileDropdownVariants = {
        hidden: { 
            opacity: 0,
            scale: 0.9,
            y: -10,
            transformOrigin: "top right"
        },
        visible: { 
            opacity: 1,
            scale: 1,
            y: 0,
            transition: { 
                type: "spring",
                stiffness: 400,
                damping: 25
            }
        },
        exit: { 
            opacity: 0,
            scale: 0.9,
            y: -10,
            transition: { 
                duration: 0.2
            }
        }
    };

    // Blur backdrop
    const backdropVariants = {
        hidden: { opacity: 0 },
        visible: { 
            opacity: 1,
            transition: { duration: 0.3 }
        },
        exit: { 
            opacity: 0,
            transition: { duration: 0.3 }
        }
    };

    return (
        <div 
            className={`fixed top-0 left-0 right-0 flex justify-between items-center bg-white border border-gray-800 rounded-[15px] sm:rounded-[20px] w-[95vw] sm:w-[90vw] md:w-[85vw] lg:w-[80vw] h-[60px] sm:h-[70px] mt-[2%] sm:mt-[1%] mx-auto shadow-md z-50 transition-all duration-300 ${visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}
        >
            {/* Logo */}
            <div className="flex justify-center items-center h-full ml-3 sm:ml-[3%] rounded-[20px]">
                <Link to="/">
                    <img 
                        src="https://cdn.prod.website-files.com/67ccd759c5839fca18ed2c8f/67ccde31189939f4c5cd0722_Netronix%20Logo%20black.png" 
                        alt="Netronix Logo" 
                        className="w-[140px] sm:w-[180px] md:w-[220px]"
                    />
                </Link>
            </div>

            {/* Desktop Navigation */}
            <div className="flex justify-end items-center h-full">
                <div className="hidden md:grid grid-cols-4 w-full">
                    <div className="flex justify-center items-center">
                        <div className="relative" ref={dropdownRef}>
                            <button 
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className="flex items-center text-gray-900 text-center text-[14px] lg:text-[15px] font-michroma hover:text-gray-600 transition-colors"
                            >
                                Products
                                <span className={`ml-2 transition-transform duration-300 ${dropdownOpen ? 'rotate-180' : ''}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </span>
                            </button>
                            {dropdownOpen && (
                                <div className="absolute top-full left-0 bg-white min-w-[200px] z-50 mt-2 rounded-lg shadow-lg py-2 border border-gray-100 animate-fadeIn">
                                    <Link 
                                        to="/products" 
                                        className="block px-4 py-2 hover:bg-gray-100 transition-colors"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            handleNavigation("/products");
                                        }}
                                    >
                                        All Products
                                    </Link>
                                    <div className="border-t border-gray-100 my-1"></div>
                                    {featuredTags.map((tag, index) => (
                                        <Link 
                                            key={index} 
                                            to={`/products?tag=${tag}`} 
                                            className="block px-4 py-2 hover:bg-gray-100 transition-colors"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                handleNavigation(`/products?tag=${tag}`);
                                            }}
                                        >
                                            {tag}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex justify-center items-center">
                        <Link to="/about" className="text-gray-900 text-center text-[14px] lg:text-[15px] font-michroma hover:text-gray-600 transition-colors">About Us</Link>
                    </div>
                    
                    <div className="flex justify-center items-center">
                        <Link to="/contact" className="text-gray-900 text-center text-[14px] lg:text-[15px] font-michroma hover:text-gray-600 transition-colors">Contact Us</Link>
                    </div>
                    
                    <div className="flex justify-end items-center mr-5 gap-4 lg:gap-6">
                        {/* Search icon */}
                        <IoSearchOutline 
                            onClick={() => { navigate("/products"); setShowSearch(true) }} 
                            className="w-5 h-5 lg:w-6 lg:h-6 cursor-pointer text-gray-800 hover:text-black transition-colors" 
                        />
                    
                        {/* User account icon with improved dropdown */}
                        <div className="relative" ref={profileDropdownRef}>
                            <motion.button
                                className="profile-trigger flex items-center space-x-1 focus:outline-none"
                                onClick={() => token ? setProfileDropdownOpen(!profileDropdownOpen) : navigate('/login')}
                                whileTap={{ scale: 0.95 }}
                            >
                                <IoPersonOutline className="w-5 h-5 lg:w-6 lg:h-6 text-gray-800 hover:text-black transition-colors" />
                                {token && (
                                    <FiChevronDown className={`w-4 h-4 text-gray-600 transition-transform duration-300 ${profileDropdownOpen ? 'rotate-180' : ''}`} />
                                )}
                            </motion.button>
                            
                            <AnimatePresence>
                                {token && profileDropdownOpen && (
                                    <>
                                        <motion.div
                                            className="fixed inset-0 bg-black bg-opacity-10 z-40 hidden md:block"
                                            variants={backdropVariants}
                                            initial="hidden"
                                            animate="visible"
                                            exit="exit"
                                            onClick={() => setProfileDropdownOpen(false)}
                                            style={{ pointerEvents: 'none' }}
                                        />
                                        
                                        <motion.div 
                                            className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50"
                                            variants={profileDropdownVariants}
                                            initial="hidden"
                                            animate="visible"
                                            exit="exit"
                                        >
                                            <div className="py-3 border-b border-gray-100 bg-gray-50">
                                                <p className="px-4 text-sm font-medium text-gray-800">Account</p>
                                            </div>
                                            
                                            <div className="py-1">
                                                
                                                <Link 
                                                    to="/orders" 
                                                    className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                    onClick={() => setProfileDropdownOpen(false)}
                                                >
                                                    <FiShoppingBag className="w-4 h-4 mr-3 text-gray-500" />
                                                    <span>My Orders</span>
                                                </Link>

                                                <Link 
                                                    to="/wishlist" 
                                                    className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                    onClick={() => setProfileDropdownOpen(false)}
                                                >
                                                    <FiHeart className="w-4 h-4 mr-3 text-gray-500" />
                                                    <span>My Wishlist</span>
                                                </Link>
                                            </div>
                                            
                                            <div className="py-1 border-t border-gray-100">
                                                <button 
                                                    className="flex w-full items-center px-4 py-3 text-sm text-red-500 hover:bg-gray-50 transition-colors"
                                                    onClick={() => {
                                                        logout();
                                                        setProfileDropdownOpen(false);
                                                    }}
                                                >
                                                    <FiLogOut className="w-4 h-4 mr-3" />
                                                    <span>Sign Out</span>
                                                </button>
                                            </div>
                                        </motion.div>
                                    </>
                                )}
                            </AnimatePresence>
                        </div>
                        
                        {/* Cart icon with counter */}
                        <Link to='/cart' className='relative'>
                            <BsCartDash className='w-5 h-5 lg:w-6 lg:h-6 cursor-pointer text-gray-800 hover:text-black transition-colors' />
                            <p className='absolute right-[-5px] bottom-[-5px] w-4 text-center leading-4 bg-black text-white aspect-square rounded-full text-[8px]'>
                                {getCartCount()}
                            </p>
                        </Link>
                    </div>
                </div>
                
                {/* Mobile Icons (Search, User, Cart, Menu) */}
                <div className="md:hidden flex items-center gap-3 sm:gap-5 mr-3 sm:mr-5">
                    <IoSearchOutline 
                        onClick={() => { navigate("/products"); setShowSearch(true) }} 
                        className="w-5 h-5 sm:w-6 sm:h-6 cursor-pointer text-gray-800" 
                    />
                    
                    {/* Mobile Profile Icon with dropdown */}
                    <div className="relative" ref={profileDropdownRef}>
                        <motion.button 
                            className="profile-trigger flex items-center"
                            onClick={() => token ? setProfileDropdownOpen(!profileDropdownOpen) : navigate('/login')}
                            whileTap={{ scale: 0.95 }}
                        >
                            <IoPersonOutline className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
                        </motion.button>
                        
                        <AnimatePresence>
                            {token && profileDropdownOpen && (
                                <>
                                    <motion.div
                                        className="fixed inset-0 bg-black bg-opacity-25 z-40"
                                        variants={backdropVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                        onClick={() => setProfileDropdownOpen(false)}
                                    />
                                    
                                    <motion.div 
                                        className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden z-50"
                                        variants={profileDropdownVariants}
                                        initial="hidden"
                                        animate="visible"
                                        exit="exit"
                                    >
                                        <div className="py-3 border-b border-gray-100 bg-gray-50">
                                            <p className="px-4 text-sm font-medium text-gray-800">Account</p>
                                        </div>
                                        
                                        <div className="py-1">
                                            
                                            <Link 
                                                to="/orders" 
                                                className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                onClick={() => setProfileDropdownOpen(false)}
                                            >
                                                <FiShoppingBag className="w-4 h-4 mr-3 text-gray-500" />
                                                <span>My Orders</span>
                                            </Link>

                                            <Link 
                                                to="/wishlist" 
                                                className="flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                                onClick={() => setProfileDropdownOpen(false)}
                                            >
                                                <FiHeart className="w-4 h-4 mr-3 text-gray-500" />
                                                <span>My Wishlist</span>
                                            </Link>
                                        </div>
                                        
                                        <div className="py-1 border-t border-gray-100">
                                            <button 
                                                className="flex w-full items-center px-4 py-3 text-sm text-red-500 hover:bg-gray-50 transition-colors"
                                                onClick={() => {
                                                    logout();
                                                    setProfileDropdownOpen(false);
                                                }}
                                            >
                                                <FiLogOut className="w-4 h-4 mr-3" />
                                                <span>Sign Out</span>
                                            </button>
                                        </div>
                                    </motion.div>
                                </>
                            )}
                        </AnimatePresence>
                    </div>
                    
                    <Link to='/cart' className='relative'>
                        <BsCartDash className='w-5 h-5 sm:w-6 sm:h-6 cursor-pointer text-gray-800' />
                        <p className='absolute right-[-5px] bottom-[-5px] w-4 text-center leading-4 bg-black text-white aspect-square rounded-full text-[8px]'>
                            {getCartCount()}
                        </p>
                    </Link>
                    
                    <motion.button
                        className="menu-trigger relative z-50 p-1 rounded-full hover:bg-gray-100 transition-colors"
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        whileTap={{ scale: 0.9 }}
                    >
                        {mobileMenuOpen ? (
                            <IoCloseOutline className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
                        ) : (
                            <CiMenuBurger className="w-5 h-5 sm:w-6 sm:h-6 text-gray-800" />
                        )}
                    </motion.button>
                </div>
            </div>

            {/* Animated Mobile Menu Dropdown */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40"
                            variants={backdropVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                            onClick={() => setMobileMenuOpen(false)}
                        />
                        
                        {/* Menu Container */}
                        <motion.div 
                            ref={mobileMenuRef}
                            className="fixed top-0 left-0 right-0 bg-white shadow-xl z-50 origin-top w-[95vw] mx-auto mt-[calc(2%+60px)] sm:mt-[calc(1%+70px)] border border-gray-200"
                            variants={menuVariants}
                            initial="hidden"
                            animate="visible"
                            exit="exit"
                        >
                            <div className="overflow-y-auto max-h-[70vh] pb-6 px-2">
                                {/* Menu Items */}
                                <div className="grid grid-cols-1 gap-1 pt-6 px-4">
                                    {/* Home link */}
                                    <motion.div
                                        custom={0}
                                        variants={listItemVariants}
                                        initial="hidden"
                                        animate="visible"
                                    >
                                        <Link 
                                            to="/" 
                                            className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors font-michroma text-gray-800"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                handleNavigation("/");
                                            }}
                                        >
                                            <span>HOME</span>
                                            <motion.span 
                                                initial={{ x: -5, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 0.2 }}
                                            >→</motion.span>
                                        </Link>
                                    </motion.div>
                                    
                                    {/* All Products link */}
                                    <motion.div
                                        custom={1}
                                        variants={listItemVariants}
                                        initial="hidden"
                                        animate="visible"
                                    >
                                        <Link 
                                            to="/products" 
                                            className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors font-michroma text-gray-800"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                handleNavigation("/products");
                                            }}
                                        >
                                            <span>ALL PRODUCTS</span>
                                            <motion.span 
                                                initial={{ x: -5, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 0.25 }}
                                            >→</motion.span>
                                        </Link>
                                    </motion.div>
                                    
                                    {/* Product categories */}
                                    <div className="my-2 border-t border-gray-100"></div>
                                    <h3 className="text-xs uppercase text-gray-400 font-semibold ml-3 mb-1">Categories</h3>
                                    
                                    {featuredTags.map((tag, index) => (
                                        <motion.div
                                            key={tag}
                                            custom={index + 2}
                                            variants={listItemVariants}
                                            initial="hidden"
                                            animate="visible"
                                        >
                                            <Link 
                                                to={`/products?tag=${tag}`} 
                                                className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors font-michroma text-gray-800"
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    handleNavigation(`/products?tag=${tag}`);
                                                }}
                                            >
                                                <span>{tag}</span>
                                                <motion.span 
                                                    initial={{ x: -5, opacity: 0 }}
                                                    animate={{ x: 0, opacity: 1 }}
                                                    transition={{ delay: 0.3 + (index * 0.05) }}
                                                >→</motion.span>
                                            </Link>
                                        </motion.div>
                                    ))}
                                    
                                    {/* About & Contact */}
                                    <div className="my-2 border-t border-gray-100"></div>
                                    <h3 className="text-xs uppercase text-gray-400 font-semibold ml-3 mb-1">Company</h3>
                                    
                                    <motion.div
                                        custom={8}
                                        variants={listItemVariants}
                                        initial="hidden"
                                        animate="visible"
                                    >
                                        <Link 
                                            to="/about" 
                                            className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors font-michroma text-gray-800"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                handleNavigation("/about");
                                            }}
                                        >
                                            <span>ABOUT US</span>
                                            <motion.span 
                                                initial={{ x: -5, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 0.55 }}
                                            >→</motion.span>
                                        </Link>
                                    </motion.div>
                                    
                                    <motion.div
                                        custom={9}
                                        variants={listItemVariants}
                                        initial="hidden"
                                        animate="visible"
                                    >
                                        <Link 
                                            to="/contact" 
                                            className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors font-michroma text-gray-800"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                handleNavigation("/contact");
                                            }}
                                        >
                                            <span>CONTACT US</span>
                                            <motion.span 
                                                initial={{ x: -5, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 0.6 }}
                                            >→</motion.span>
                                        </Link>
                                    </motion.div>
                                    
                                    {/* User Account Section */}
                                    {token && (
                                        <>
                                            <div className="my-2 border-t border-gray-100"></div>
                                            <h3 className="text-xs uppercase text-gray-400 font-semibold ml-3 mb-1">Account</h3>
                                            
                                            <motion.div
                                                custom={10}
                                                variants={listItemVariants}
                                                initial="hidden"
                                                animate="visible"
                                            >
                                                <Link 
                                                    to="/profile" 
                                                    className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors font-michroma text-gray-800"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        handleNavigation("/profile");
                                                    }}
                                                >
                                                    <span>MY PROFILE</span>
                                                    <motion.span 
                                                        initial={{ x: -5, opacity: 0 }}
                                                        animate={{ x: 0, opacity: 1 }}
                                                        transition={{ delay: 0.65 }}
                                                    >→</motion.span>
                                                </Link>
                                            </motion.div>
                                            
                                            <motion.div
                                                custom={11}
                                                variants={listItemVariants}
                                                initial="hidden"
                                                animate="visible"
                                            >
                                                <Link 
                                                    to="/orders" 
                                                    className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors font-michroma text-gray-800"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        handleNavigation("/orders");
                                                    }}
                                                >
                                                    <span>MY ORDERS</span>
                                                    <motion.span 
                                                        initial={{ x: -5, opacity: 0 }}
                                                        animate={{ x: 0, opacity: 1 }}
                                                        transition={{ delay: 0.7 }}
                                                    >→</motion.span>
                                                </Link>
                                            </motion.div>
                                            
                                            <motion.div
                                                custom={12}
                                                variants={listItemVariants}
                                                initial="hidden"
                                                animate="visible"
                                            >
                                                <Link 
                                                    to="/wishlist" 
                                                    className="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors font-michroma text-gray-800"
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        handleNavigation("/wishlist");
                                                    }}
                                                >
                                                    <span>MY WISHLIST</span>
                                                    <motion.span 
                                                        initial={{ x: -5, opacity: 0 }}
                                                        animate={{ x: 0, opacity: 1 }}
                                                        transition={{ delay: 0.75 }}
                                                    >→</motion.span>
                                                </Link>
                                            </motion.div>
                                            
                                            <motion.div
                                                custom={13}
                                                variants={listItemVariants}
                                                initial="hidden"
                                                animate="visible"
                                            >
                                                <button 
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        logout();
                                                        handleNavigation("/login");
                                                    }}
                                                    className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors font-michroma text-gray-800"
                                                >
                                                    <span>LOG OUT</span>
                                                    <motion.span 
                                                        initial={{ x: -5, opacity: 0 }}
                                                        animate={{ x: 0, opacity: 1 }}
                                                        transition={{ delay: 0.8 }}
                                                    >→</motion.span>
                                                </button>
                                            </motion.div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    )
}

export default Navbar