import userModel from "../models/userModel.js"


// add products to user cart
const addToCart = async (req, res) => {
    try {
        const { userId, itemId, variantKey } = req.body

        const userData = await userModel.findById(userId)
        let cartData = await userData.cartData

        if (cartData[itemId]) {
            if (cartData[itemId][variantKey]) {
                cartData[itemId][variantKey] += 1
            }
            else {
                cartData[itemId][variantKey] = 1
            }
        } else {
            cartData[itemId] = {}
            cartData[itemId][variantKey] = 1
        }

        await userModel.findByIdAndUpdate(userId, { cartData })

        res.json({ success: true, message: "Cart Updated" })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message });
    }
}

// update products to user cart
const updateCart = async (req, res) => {
    try {
        const { userId, itemId, variantKey, quantity } = req.body

        const userData = await userModel.findById(userId)
        let cartData = await userData.cartData

        cartData[itemId][variantKey] = quantity
        
        await userModel.findByIdAndUpdate(userId, { cartData })
        
        res.json({ success: true, message: "Cart Updated" })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message });
    }
}

// get user cart data
const getUserCart = async (req, res) => {
    try {
        const { userId } = req.body
        const userData = await userModel.findById(userId)
        let cartData = await userData.cartData

        res.json({ success: true, cartData})
        
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message });
    }
}

export { addToCart, updateCart, getUserCart }