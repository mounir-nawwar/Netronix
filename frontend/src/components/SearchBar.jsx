import { useContext, useEffect, useRef, useState } from 'react'
import { ShopContext } from '../context/shopContext'
import { IoSearchOutline } from "react-icons/io5";
import { IoCloseOutline } from "react-icons/io5";

// FE-023 — the scroll effect listed `lastScrollY` in its dependencies and set
// it from inside the handler, so it unsubscribed and re-subscribed on **every
// scroll event**. Twenty scroll events meant twenty-one listener
// registrations. The previous position is a ref now and the effect runs once.
//
// A11Y-002 / A11Y-009 — the overlay had `autoFocus` and an Escape handler, and
// nothing else: no dialog semantics, no accessible name on the input (a
// placeholder is not one), and no focus restoration, so dismissing it dropped
// keyboard focus back to the top of the document. It is a modal dialog now,
// with a focus trap, and closing it returns focus to whatever opened it.

const SearchBar = () => {
    const { search, setSearch, showSearch, setShowSearch, navigate } = useContext(ShopContext);
    const [isVisible, setIsVisible] = useState(true);

    const lastScrollY = useRef(0);
    const panelRef = useRef(null);
    const inputRef = useRef(null);
    const openerRef = useRef(null);

    const handleSearchSubmit = (e) => {
        e.preventDefault();
        if (search.trim()) {
            navigate(`/products?search=${encodeURIComponent(search.trim())}`);
            setShowSearch(false);
        }
    };

    useEffect(() => {
        const handleScroll = () => {
            const currentScrollY = window.scrollY;
            setIsVisible(currentScrollY <= lastScrollY.current);
            lastScrollY.current = currentScrollY;
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // Remember the opener, move focus in, and put it back on close.
    useEffect(() => {
        if (!showSearch) return undefined;

        openerRef.current = document.activeElement;
        inputRef.current?.focus();

        return () => {
            const opener = openerRef.current;
            if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
                opener.focus();
            }
        };
    }, [showSearch]);

    // Escape closes; Tab cycles inside the panel.
    useEffect(() => {
        if (!showSearch) return undefined;

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                setShowSearch(false);
                return;
            }
            if (event.key !== 'Tab') return;

            const focusable = panelRef.current?.querySelectorAll(
                'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
            );
            if (!focusable || focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [showSearch, setShowSearch]);

    if (!showSearch) return null;

    return (
        <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Search products"
            className={`fixed top-[80px] sm:top-[90px] left-0 right-0 z-40 transition-transform duration-300 ${isVisible ? 'translate-y-0' : '-translate-y-full'}`}
        >
            <form onSubmit={handleSearchSubmit} className='max-w-3xl mx-auto px-4 py-4 flex items-center justify-center'>
                <div className='flex items-center justify-between border border-gray-300 rounded-full w-full px-5 py-3 bg-white focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500'>
                    <label htmlFor="product-search" className="sr-only">Search for products</label>
                    <input
                        id="product-search"
                        ref={inputRef}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className='flex-1 outline-none bg-inherit text-sm'
                        type="search"
                        placeholder='Search for products...'
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => setSearch('')}
                            aria-label="Clear the search box"
                            className="text-gray-400 hover:text-gray-600 mr-2"
                        >
                            <IoCloseOutline aria-hidden="true" className="w-5 h-5" />
                        </button>
                    )}
                    <button type="submit" aria-label="Search" className="ml-2">
                        <IoSearchOutline aria-hidden="true" className='w-5 h-5 text-gray-500 hover:text-indigo-600' />
                    </button>
                </div>
                <button
                    type="button"
                    onClick={() => setShowSearch(false)}
                    aria-label="Close search"
                    className='ml-4 p-2 rounded-full hover:bg-gray-100 transition-colors'
                >
                    <IoCloseOutline aria-hidden="true" className='w-6 h-6 text-gray-600' />
                </button>
            </form>
        </div>
    );
}

export default SearchBar
