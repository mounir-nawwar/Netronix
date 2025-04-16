import React, { useContext, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ShopContext } from '../context/ShopContext';
import { IoPersonOutline } from "react-icons/io5";
import { BsCartDash } from "react-icons/bs";
import { IoSearchOutline } from "react-icons/io5";
import { CiMenuBurger } from "react-icons/ci";
import { IoCloseOutline } from "react-icons/io5";
import axios from 'axios';

const Navbar = ({ visible }) => {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [sidebarVisible, setSidebarVisible] = useState(false);
    const { setShowSearch, getCartCount, navigate, token, setToken, setCartItems, backendUrl } = useContext(ShopContext);
    const [tags, setTags] = useState([]);
    
    // Featured tags to display in navigation
    const featuredTags = ["Electronics", "Accessories", "Featured", "New Arrivals", "Best Sellers"];

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

    return (
        <div 
            className={`fixed top-0 left-0 right-0 flex justify-between items-center bg-white border border-gray-800 rounded-[20px] w-[80vw] h-[70px] mt-[1%] mx-auto shadow-md z-50 transition-all duration-300 ${visible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0'}`}
        >
            <div className="flex justify-center items-center h-[70px] ml-[3%] rounded-[20px]">
                <Link to="/">
                    <img 
                        src="https://cdn.prod.website-files.com/67ccd759c5839fca18ed2c8f/67ccde31189939f4c5cd0722_Netronix%20Logo%20black.png" 
                        alt="Netronix Logo" 
                        className="w-[220px]"
                    />
                </Link>
            </div>

            <div className="flex justify-end items-center w-1/2 h-[70px]">
                <div className="hidden sm:grid grid-cols-4 w-full">
                    <div className="flex justify-center items-center">
                        <div className="relative">
                            <button 
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                className="flex items-center text-gray-900 text-center text-[15px] font-michroma"
                            >
                                Products
                                <span className="ml-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                                    </svg>
                                </span>
                            </button>
                            {dropdownOpen && (
                                <div className="absolute top-full left-0 bg-white min-w-[200px] z-50 mt-2 rounded-lg shadow-md py-2">
                                    <Link 
                                        to="/collections/all" 
                                        className="block px-4 py-2 hover:bg-gray-100"
                                        onClick={() => setDropdownOpen(false)}
                                    >
                                        All Products
                                    </Link>
                                    <div className="border-t border-gray-100 my-1"></div>
                                    {featuredTags.map((tag, index) => (
                                        <Link 
                                            key={index} 
                                            to={`/collections/tag/${tag}`} 
                                            className="block px-4 py-2 hover:bg-gray-100"
                                            onClick={() => setDropdownOpen(false)}
                                        >
                                            {tag}
                                        </Link>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex justify-center items-center">
                        <Link to="/about" className="text-gray-900 text-center text-[15px] font-michroma">About Us</Link>
                    </div>
                    
                    <div className="flex justify-center items-center">
                        <Link to="/contact" className="text-gray-900 text-center text-[15px] font-michroma">Contact Us</Link>
                    </div>
                    
                    <div className="flex justify-end items-center mr-5 gap-4">
                        {/* Search icon */}
                        <IoSearchOutline 
                            onClick={() => { navigate("/collections/all"); setShowSearch(true) }} 
                            className="w-6 h-6 cursor-pointer text-black-700" 
                        />
                    
                        {/* User account icon with dropdown */}
                        <div className="relative group">
                            <IoPersonOutline 
                                onClick={() => token ? null : navigate('/login')} 
                                className="w-6 h-6 cursor-pointer text-black-700" 
                            />
                            {token && (
                                <div className="group-hover:block hidden absolute right-0 pt-4 z-60">
                                    <div className="flex flex-col gap-2 w-36 py-3 px-5 bg-slate-100 text-gray-500 rounded shadow-md">
                                        <p className="cursor-pointer hover:text-black">My Profile</p>
                                        <p onClick={()=> navigate('/orders')} className="cursor-pointer hover:text-black">Orders</p>
                                        <p onClick={logout} className="cursor-pointer hover:text-black">Log Out</p>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Cart icon with counter */}
                        <Link to='/cart' className='relative'>
                            <BsCartDash className='w-6 h-6 cursor-pointer text-black-700' />
                            <p className='absolute right-[-5px] bottom-[-5px] w-4 text-center leading-4 bg-black text-white aspect-square rounded-full text-[8px]'>
                                {getCartCount()}
                            </p>
                        </Link>
                    </div>
                </div>
                
                {/* Mobile menu icon */}
                <div className="sm:hidden flex items-center mr-5">
                    <CiMenuBurger 
                        onClick={() => setSidebarVisible(true)} 
                        className="w-6 h-6 cursor-pointer text-black-700" 
                    />
                </div>
            </div>

            {/* Sidebar menu for small screens */}
            <div className={`fixed top-0 right-0 bottom-0 overflow-hidden bg-white transition-all duration-300 ${sidebarVisible ? 'w-full' : 'w-0'} z-60`}>
                <div className='flex flex-col text-gray-600'>
                    <div onClick={() => setSidebarVisible(false)} className='flex items-center gap-4 p-3 cursor-pointer'>
                        <IoCloseOutline className='h-5 rotate-180' />
                        <p>Back</p>
                    </div>
                    <Link onClick={() => setSidebarVisible(false)} className='py-2 pl-6 border font-michroma' to='/'>HOME</Link>
                    <Link onClick={() => setSidebarVisible(false)} className='py-2 pl-6 border font-michroma' to='/collections/all'>ALL PRODUCTS</Link>
                    
                    {/* Featured tags in mobile menu */}
                    {featuredTags.map((tag, index) => (
                        <Link 
                            key={index} 
                            onClick={() => setSidebarVisible(false)} 
                            className='py-2 pl-6 border font-michroma' 
                            to={`/collections/tag/${tag}`}
                        >
                            {tag}
                        </Link>
                    ))}
                    
                    <Link onClick={() => setSidebarVisible(false)} className='py-2 pl-6 border font-michroma' to='/about'>ABOUT US</Link>
                    <Link onClick={() => setSidebarVisible(false)} className='py-2 pl-6 border font-michroma' to='/contact'>CONTACT US</Link>
                    
                    <div className="flex justify-around items-center mt-4">
                        <IoSearchOutline 
                            onClick={() => { 
                                navigate("/collections/all"); 
                                setShowSearch(true);
                                setSidebarVisible(false);
                            }} 
                            className="w-6 h-6 cursor-pointer text-black-700" 
                        />
                        <IoPersonOutline 
                            onClick={() => {
                                token ? null : navigate('/login');
                                setSidebarVisible(false);
                            }} 
                            className="w-6 h-6 cursor-pointer text-black-700" 
                        />
                        <Link 
                            to='/cart' 
                            className='relative'
                            onClick={() => setSidebarVisible(false)}
                        >
                            <BsCartDash className='w-6 h-6 cursor-pointer text-black-700' />
                            <p className='absolute right-[-5px] bottom-[-5px] w-4 text-center leading-4 bg-black text-white aspect-square rounded-full text-[8px]'>
                                {getCartCount()}
                            </p>
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Navbar