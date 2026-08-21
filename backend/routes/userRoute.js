import express from 'express';
import {
    loginUser,
    registerUser,
    adminLogin,
    adminSession,
    logoutUser,
    addToWishlist,
    removeFromWishlist,
    getWishlist,
} from '../controllers/userController.js';
import authUser from '../middleware/auth.js';
import adminAuth from '../middleware/adminAuth.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
    registerSchema,
    loginSchema,
    adminLoginSchema,
    wishlistSchema,
    emptyBodySchema,
} from '../validators/user.js';

const userRouter = express.Router();

// 5 attempts per 15 minutes per IP across all three (SEC-005). Unlimited
// guessing against a single admin credential was the sharpest edge of that
// finding.
userRouter.post('/register', authLimiter, validate(registerSchema), registerUser)
userRouter.post('/login', authLimiter, validate(loginSchema), loginUser)
userRouter.post('/admin', authLimiter, validate(adminLoginSchema), adminLogin)

// Server-verified admin session. The console renders its shell only once this
// succeeds, so a fabricated localStorage value unlocks nothing (SEC-012).
userRouter.get('/admin/session', adminAuth, adminSession)

// Revocation. Increments tokenVersion, invalidating every token outstanding for
// the caller (SEC-003). One endpoint, used by both clients.
userRouter.post('/logout', authUser, validate(emptyBodySchema), logoutUser)

// Wishlist routes
userRouter.post('/wishlist/add', authUser, validate(wishlistSchema), addToWishlist)
userRouter.post('/wishlist/remove', authUser, validate(wishlistSchema), removeFromWishlist)
userRouter.post('/wishlist/get', authUser, validate(emptyBodySchema), getWishlist)

export default userRouter;
