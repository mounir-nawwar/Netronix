import { createContext, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom"
import axios from 'axios'

export const ShopContext = createContext();

const ShopContextProvider = (props) => {
    const currency = '$';
    const delivery_fee = 3;
    const backendUrl = import.meta.env.VITE_BACKEND_URL
    const frontendUrl = import.meta.env.VITE_FRONTEND_URL || window.location.origin;
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [cartItems, setCartItems] = useState({});
    const [products, setProducts] = useState([]);
    const [token, setToken] = useState('')
    const [wishlist, setWishlist] = useState([]);
    const navigate = useNavigate();

    // Load cart from localStorage for guest users
    useEffect(() => {
        // Try to load guest cart from localStorage if no token
        if (!token && localStorage.getItem('guestCart')) {
            try {
                const savedCart = JSON.parse(localStorage.getItem('guestCart'));
                if (savedCart && typeof savedCart === 'object') {
                    setCartItems(savedCart);
                    console.log('Loaded guest cart from localStorage');
                }
            } catch (error) {
                console.error('Error loading guest cart:', error);
                localStorage.removeItem('guestCart');
            }
        }
    }, [token]);

    // Save cart to localStorage for guest users
    useEffect(() => {
        // Only save to localStorage if no token (guest user)
        if (!token && Object.keys(cartItems).length > 0) {
            localStorage.setItem('guestCart', JSON.stringify(cartItems));
            console.log('Saved guest cart to localStorage');
        }
    }, [cartItems, token]);

    // Enhanced navigation function that handles search state
    const navigateWithContext = (path, options = {}) => {
        try {
            // Close search if not explicitly kept open
            if (!options.keepSearchOpen) {
                setShowSearch(false);
            }
            
            // Reset search term if navigating away from products page
            if (!path.includes('products') && !options.keepSearchTerm) {
                setSearch('');
            }
            
            // Perform the navigation
            navigate(path);
        } catch (error) {
            console.error("Navigation error:", error);
            // Fall back to direct navigation if there's an error
            window.location.href = path;
        }
    };

    const addToCart = async (itemId, variantKey, quantity = 1) => {
        if (!variantKey) {
            toast.error('Select Product Options')
            return;
        }

        // Find the product to check inventory
        const product = products.find(p => p._id === itemId);
        if (!product) {
            toast.error('Product not found');
            return;
        }

        // Check if inventory exists and has enough quantity
        if (!product.inventory || !product.inventory[variantKey] || product.inventory[variantKey] <= 0) {
            toast.error(`Selected variant is out of stock`);
            return;
        }

        // Get current quantity in cart
        const currentQuantityInCart = cartItems[itemId] && cartItems[itemId][variantKey] ? cartItems[itemId][variantKey] : 0;
        
        // Check if adding the requested quantity would exceed available inventory
        if (currentQuantityInCart + quantity > product.inventory[variantKey]) {
            toast.error(`Cannot add ${quantity} items. Only ${product.inventory[variantKey] - currentQuantityInCart} more available for this variant`);
            return;
        }

        let cartData = structuredClone(cartItems)

        if (cartData[itemId]) {
            if (cartData[itemId][variantKey]) {
                cartData[itemId][variantKey] += quantity;
            }
            else {
                cartData[itemId][variantKey] = quantity;
            }
        }
        else {
            cartData[itemId] = {};
            cartData[itemId][variantKey] = quantity;
        }
        setCartItems(cartData);
        
        // Get the selected variant options to display in the toast
        const variantOptions = variantKey.split('-');
        const variantDisplay = product.variants && product.variants.length > 0 
            ? product.variants.map((variant, index) => 
                `${variant.name}: ${variantOptions[index]}`
              ).join(', ')
            : 'Default';

        // Show styled toast notification
        toast.success(
            <div className="flex items-center">
                <div className="flex-shrink-0 w-10 h-10 mr-2 bg-gray-100 rounded-md overflow-hidden">
                    {product.image && Array.isArray(product.image) && product.image[0] ? (
                        <img 
                            src={product.image[0]} 
                            alt={product.name} 
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gray-200">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                            </svg>
                        </div>
                    )}
                </div>
                <div>
                    <p className="font-michroma text-sm text-[#6a5acd]">{product.name}</p>
                    <p className="text-xs text-gray-700">Added to cart • {quantity} × {variantDisplay}</p>
                </div>
            </div>,
            {
                position: "bottom-right",
                autoClose: 3000,
                hideProgressBar: false,
                closeOnClick: true,
                pauseOnHover: true,
                draggable: true,
                progress: undefined,
                style: { 
                    background: "#ffffff",
                    color: "#000000",
                    borderLeft: "4px solid #6a5acd",
                    fontFamily: "Outfit, sans-serif"
                },
            }
        );
        
        if (token) {
            try {
                await axios.post(backendUrl + '/api/cart/add', { itemId, variantKey, quantity }, { headers: { token } })
            } catch (error) {
                console.log(error);
                toast.error(error.message)
            }
        } else {
            // For guest users, save to localStorage
            localStorage.setItem('guestCart', JSON.stringify(cartData));
        }
    }

    // Helper function to get variant display name from key
    const getVariantDisplayName = (product, variantKey) => {
        if (!product || !product.variants || !variantKey) return variantKey;
        
        try {
            const variantOptions = variantKey.split('-');
            if (product.variants.length !== variantOptions.length) return variantKey;
            
            return product.variants.map((variant, index) => 
                `${variant.name}: ${variantOptions[index]}`
            ).join(', ');
        } catch (e) {
            return variantKey;
        }
    }

    const getCartCount = () => {
        let totalCount = 0;
        for (const items in cartItems) {
            for (const item in cartItems[items]) {
                try {
                    if (cartItems[items][item] > 0) {
                        totalCount += cartItems[items][item];
                    }
                } catch (error) {

                }
            }
        }
        return totalCount;
    }

    const updateQuantity = async (itemId, variantKey, quantity) => {
        let cartData = structuredClone(cartItems);

        cartData[itemId][variantKey] = quantity;

        setCartItems(cartData);

        if (token) {
            try {
                axios.post(backendUrl + '/api/cart/update', { itemId, variantKey, quantity }, { headers: { token } })
            } catch (error) {
                console.log(error);
                toast.error(error.message)
            }
        }
    }

    const getCartAmount = () => {
        let totalAmount = 0;
        for (const items in cartItems) {
            let itemInfo = products.find((product) => product._id === items);
            for (const item in cartItems[items]) {
                try {
                    if (cartItems[items][item]) {
                        totalAmount += itemInfo.price * cartItems[items][item];
                    }
                } catch (error) {

                }
            }
        }

        return totalAmount;
    }

    const getProductsData = async () => {
        try {
            const response = await axios.get(backendUrl + '/api/product/list')
            if (response.data.success) {
                // Ensure each product has properly formatted fields
                const processedProducts = response.data.products.map(product => {
                    // Ensure image is always an array
                    const imageArray = Array.isArray(product.image) ? product.image : [];
                    
                    // Make sure all image URLs are valid strings
                    const validImages = imageArray.filter(img => typeof img === 'string' && img.trim() !== '');
                    
                    // If description exists in desc field but not in description field, copy it
                    const description = product.description || product.desc || '';
                    
                    return {
                        ...product,
                        image: validImages,
                        description: description,
                        // Ensure variants is always an array
                        variants: Array.isArray(product.variants) ? product.variants : [],
                        // Ensure tags is always an array 
                        tags: Array.isArray(product.tags) ? product.tags : [],
                        // Ensure inventory exists
                        inventory: product.inventory || {}
                    };
                });
                setProducts(processedProducts);
                
                // Log how many products have images
                const withImages = processedProducts.filter(p => p.image && p.image.length > 0).length;
                console.log(`Loaded ${processedProducts.length} products, ${withImages} with images`);
            } else {
                toast.error(response.data.message);
            }
        } catch (error) {
            console.log(error);
            toast.error("Error loading products");
        }
    }

    // Function to fetch a single product by ID
    const getSingleProduct = async (productId) => {
        try {
            // First try to find the product in already loaded products
            const existingProduct = products.find(p => p._id === productId);
            if (existingProduct) {
                return existingProduct; // Already processed in getProductsData
            }
            
            // If not found in existing products, fetch from API
            const response = await axios.post(`${backendUrl}/api/product/single`, { productId });
            if (response.data.success) {
                const product = response.data.product;
                
                // Process product data for consistency
                const imageArray = Array.isArray(product.image) ? product.image : [];
                const validImages = imageArray.filter(img => typeof img === 'string' && img.trim() !== '');
                const description = product.description || product.desc || '';
                
                return {
                    ...product,
                    image: validImages,
                    description: description,
                    variants: Array.isArray(product.variants) ? product.variants : [],
                    tags: Array.isArray(product.tags) ? product.tags : [],
                    inventory: product.inventory || {}
                };
            } else {
                toast.error(response.data.message);
                return null;
            }
        } catch (error) {
            console.log(error);
            toast.error("Error loading product");
            return null;
        }
    }

    // Function to get products by tag
    const getProductsByTag = async (tag) => {
        try {
            const response = await axios.get(`${backendUrl}/api/product/tags/${tag}`);
            if (response.data.success) {
                return response.data.products;
            } else {
                toast.error(response.data.message);
                return [];
            }
        } catch (error) {
            console.log(error);
            toast.error(error.message);
            return [];
        }
    }

    const getUserCart = async (token) => {
        try {
            const response = await axios.post(backendUrl + '/api/cart/get', {}, { headers: { token } })
            if (response.data.success) {
                setCartItems(response.data.cartData)
            }
        } catch (error) {
            console.log(error);
            toast.error(error.message)
        }
    }

    // Wishlist functions
    const addToWishlist = async (productId) => {
        if (!token) {
            toast.error('Please log in to save items');
            navigate('/login');
            return;
        }

        try {
            const response = await axios.post(
                `${backendUrl}/api/user/wishlist/add`, 
                { productId }, 
                { headers: { token } }
            );
            
            if (response.data.success) {
                // Update local wishlist state
                if (!wishlist.includes(productId)) {
                    setWishlist([...wishlist, productId]);
                }
                
                // Show toast notification
                const product = products.find(p => p._id === productId);
                if (product) {
                    toast.success(
                        <div className="flex items-center">
                            <div className="flex-shrink-0 w-10 h-10 mr-2 bg-gray-100 rounded-md overflow-hidden">
                                {product.image && Array.isArray(product.image) && product.image[0] ? (
                                    <img 
                                        src={product.image[0]} 
                                        alt={product.name} 
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gray-200">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="font-michroma text-sm text-[#6a5acd]">{product.name}</p>
                                <p className="text-xs text-gray-700">Saved to wishlist</p>
                            </div>
                        </div>
                    );
                }
            } else {
                toast.error(response.data.message);
            }
        } catch (error) {
            console.log(error);
            toast.error(error.message);
        }
    };

    const removeFromWishlist = async (productId) => {
        if (!token) return;

        try {
            const response = await axios.post(
                `${backendUrl}/api/user/wishlist/remove`, 
                { productId }, 
                { headers: { token } }
            );
            
            if (response.data.success) {
                // Update local wishlist state
                setWishlist(wishlist.filter(id => id !== productId));
                
                // Show toast notification
                toast.info('Item removed from wishlist');
            } else {
                toast.error(response.data.message);
            }
        } catch (error) {
            console.log(error);
            toast.error(error.message);
        }
    };

    const getWishlist = async () => {
        if (!token) return;

        try {
            const response = await axios.post(
                `${backendUrl}/api/user/wishlist/get`, 
                {}, 
                { headers: { token } }
            );
            
            if (response.data.success) {
                setWishlist(response.data.wishlist);
            } else {
                toast.error(response.data.message);
            }
        } catch (error) {
            console.log(error);
            toast.error(error.message);
        }
    };

    const isInWishlist = (productId) => {
        return wishlist.includes(productId);
    };

    useEffect(() => {
        getProductsData()
    }, [])

    useEffect(() => {
        if (!token && localStorage.getItem('token')) {
            setToken(localStorage.getItem('token'))
            getUserCart(localStorage.getItem('token'))
        }
    }, [])

    // Load wishlist when token is available
    useEffect(() => {
        if (token) {
            getWishlist();
        }
    }, [token]);

    // Make sure to include the frontendUrl in the context value
    const contextValue = {
        products,
        cartItems,
        addToCart,
        getCartCount,
        getCartAmount,
        updateQuantity,
        currency,
        delivery_fee,
        token,
        setToken,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        wishlist,
        getVariantDisplayName,
        search,
        setSearch,
        showSearch,
        setShowSearch,
        navigate: navigateWithContext,
        getProductsByTag,
        backendUrl,
        frontendUrl,
        getSingleProduct
    };

    return (
        <ShopContext.Provider value={contextValue}>
            {props.children}
        </ShopContext.Provider>
    );
};

export default ShopContextProvider;