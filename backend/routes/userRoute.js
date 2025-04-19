import express from 'express';
import { loginUser, registerUser, adminLogin, addToWishlist, removeFromWishlist, getWishlist } from '../controllers/userController.js';
import authUser from '../middleware/auth.js';

const userRouter = express.Router();

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.post('/admin', adminLogin)

// Wishlist routes
userRouter.post('/wishlist/add', authUser, addToWishlist)
userRouter.post('/wishlist/remove', authUser, removeFromWishlist)
userRouter.post('/wishlist/get', authUser, getWishlist)

export default userRouter;