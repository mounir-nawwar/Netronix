import { createContext, useEffect, useState } from "react";
import { toast } from "react-toastify";
import { useNavigate } from "react-router-dom"
import axios from 'axios'

export const ShopContext = createContext();

const ShopContextProvider = (props) => {
    const currency = '$';
    const delivery_fee = 3;
    const backendUrl = import.meta.env.VITE_BACKEND_URL
    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const [cartItems, setCartItems] = useState({});
    const [products, setProducts] = useState([]);
    const [token, setToken] = useState('')
    const navigate = useNavigate();

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
        
        if (token) {
            try {
                await axios.post(backendUrl + '/api/cart/add', { itemId, variantKey, quantity }, { headers: { token } })
            } catch (error) {
                console.log(error);
                toast.error(error.message)
            }
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
                setProducts(response.data.products)
            } else {
                toast.error(response.data.message);
            }
        } catch (error) {
            console.log(error);
            toast.error(error.message)
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

    useEffect(() => {
        getProductsData()
    }, [])

    useEffect(() => {
        if (!token && localStorage.getItem('token')) {
            setToken(localStorage.getItem('token'))
            getUserCart(localStorage.getItem('token'))
        }
    }, [])

    const value = {
        products, currency, delivery_fee,
        search, setSearch, showSearch, setShowSearch,
        cartItems, addToCart, setCartItems,
        getCartCount, updateQuantity,
        getCartAmount, navigate, backendUrl,
        setToken, token, getVariantDisplayName,
        getProductsByTag
    }

    return (
        <ShopContext.Provider value={value}>
            {props.children}
        </ShopContext.Provider>
    )
}

export default ShopContextProvider;