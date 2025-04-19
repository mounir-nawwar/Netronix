import validator from "validator";
import bcrypt from "bcrypt"
import userModel from "../models/userModel.js";
import jwt from "jsonwebtoken";

const createToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, {})
}

// Route for user login
const loginUser = async (req, res) => {
    try {

        const { email, password } = req.body;

        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({ success: false, message: "User doesn't exist" })
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            const token = createToken(user._id);
            res.json({ success: true, token })
        }
        else{
            res.json({ success: false, message: "Invalid password" })
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }

}

// Route for user register
const registerUser = async (req, res) => {
    try {

        const { name, email, password } = req.body;

        // checking if user already exists
        const exists = await userModel.findOne({ email })
        if (exists) {
            return res.json({ success: false, message: "User already exists" })
        }

        // validating email format & strong password
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" })
        }

        if (password.length < 8) {
            return res.json({ success: false, message: "Please enter a strong password" })
        }

        // Hashing user password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new userModel({
            name,
            email,
            password: hashedPassword
        })

        const user = await newUser.save()

        const token = createToken(user._id)

        res.json({ success: true, token })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }

}

// Route for admin Login
const adminLogin = async (req, res) => {
    try {

        const {email,password} = req.body

        if( email ===process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD){
            const token = jwt.sign(email+password, process.env.JWT_SECRET)
            res.json({ success: true, token })
        }
        else{
            res.json({ success: false, message: "Invalid email or password" })
        }
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    
    }

}

// Add product to wishlist
const addToWishlist = async (req, res) => {
    try {
        const { userId, productId } = req.body;
        
        // Get user document
        const user = await userModel.findById(userId);
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }
        
        // Check if product is already in wishlist
        if (user.wishlist.includes(productId)) {
            return res.json({ success: true, message: "Product already in wishlist" });
        }
        
        // Add product to wishlist
        user.wishlist.push(productId);
        await user.save();
        
        res.json({ success: true, message: "Product added to wishlist" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Remove product from wishlist
const removeFromWishlist = async (req, res) => {
    try {
        const { userId, productId } = req.body;
        
        // Get user document
        const user = await userModel.findById(userId);
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }
        
        // Remove product from wishlist
        user.wishlist = user.wishlist.filter(id => id !== productId);
        await user.save();
        
        res.json({ success: true, message: "Product removed from wishlist" });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

// Get user's wishlist
const getWishlist = async (req, res) => {
    try {
        const { userId } = req.body;
        
        // Get user document
        const user = await userModel.findById(userId);
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }
        
        res.json({ success: true, wishlist: user.wishlist });
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
};

export { loginUser, registerUser, adminLogin, addToWishlist, removeFromWishlist, getWishlist }