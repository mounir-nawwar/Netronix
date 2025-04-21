import React, { useContext, useEffect, useState } from 'react'
import { ShopContext } from '../context/ShopContext'
import { IoSearchOutline } from "react-icons/io5";
import { IoCloseOutline } from "react-icons/io5";
import { useLocation } from 'react-router-dom';

const SearchBar = () => {
    const {search, setSearch, showSearch, setShowSearch, navigate} = useContext(ShopContext);
    const location = useLocation();
    const [isVisible, setIsVisible] = useState(true);
    const [lastScrollY, setLastScrollY] = useState(0);

    // Handle search submission
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (search.trim()) {
            // Navigate to products page with search query
            navigate(`/products?search=${encodeURIComponent(search.trim())}`);
        }
    };

    // Handle scroll behavior for the search bar
    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            
            // Determine if we should show or hide based on scroll direction
            if (currentScrollY > lastScrollY) {
                // Scrolling down
                setIsVisible(false);
            } else {
                // Scrolling up
                setIsVisible(true);
            }
            
            setLastScrollY(currentScrollY);
        };
        
        window.addEventListener('scroll', handleScroll);
        
        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, [lastScrollY]);

    // Handle escape key to close search
    useEffect(() => {
        const handleEscKey = (e) => {
            if (e.key === 'Escape' && showSearch) {
                setShowSearch(false);
            }
        };

        window.addEventListener('keydown', handleEscKey);
        return () => window.removeEventListener('keydown', handleEscKey);
    }, [showSearch, setShowSearch]);

    return showSearch ? (
        <div className={`fixed top-[80px] sm:top-[90px] left-0 right-0 z-40 transition-transform duration-300 ${isVisible ? 'translate-y-0' : '-translate-y-full'}`}>
            <form onSubmit={handleSearchSubmit} className='max-w-3xl mx-auto px-4 py-4 flex items-center justify-center'>
                <div className='flex items-center justify-between border border-gray-300 rounded-full w-full px-5 py-3 bg-white focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500'>
                    <input 
                        value={search} 
                        onChange={(e) => setSearch(e.target.value)} 
                        className='flex-1 outline-none bg-inherit text-sm' 
                        type="text" 
                        placeholder='Search for products...'
                        autoFocus
                    />
                    {search && (
                        <button 
                            type="button" 
                            onClick={() => setSearch('')}
                            className="text-gray-400 hover:text-gray-600 mr-2"
                        >
                            <IoCloseOutline className="w-5 h-5" />
                        </button>
                    )}
                    <button type="submit" className="ml-2">
                        <IoSearchOutline className='w-5 h-5 text-gray-500 hover:text-indigo-600'/>
                    </button>
                </div>
                <button 
                    type="button"
                    onClick={() => setShowSearch(false)} 
                    className='ml-4 p-2 rounded-full hover:bg-gray-100 transition-colors'
                >
                    <IoCloseOutline className='w-6 h-6 text-gray-600' />
                </button>
            </form>
        </div>
    ) : null;
}

export default SearchBar