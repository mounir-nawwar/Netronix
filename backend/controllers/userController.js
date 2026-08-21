import bcrypt from "bcrypt"
import mongoose from 'mongoose'

import userModel from "../models/userModel.js";
import productModel from '../models/productModel.js';
import { issueToken } from "../services/tokenService.js";
import {
    asyncHandler,
    ConflictError,
    InvalidCredentialsError,
    NotFoundError,
} from "../errors/AppError.js";

/**
 * A bcrypt hash of a value nobody holds.
 *
 * Compared against when the email is unknown, so an unknown address costs the
 * same ~100 ms as a known one. Without it, "user does not exist" returns
 * immediately and "wrong password" waits for bcrypt — a timing difference that
 * re-opens the enumeration SEC-020 is about, even after the *messages* are made
 * identical. Generated once at module load, from a random value.
 */
const TIMING_DECOY_HASH = bcrypt.hashSync(
    `${Date.now()}-${Math.random()}-timing-decoy-never-a-real-password`,
    10,
)

// Route for user login
const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.validated.body;

    // `email` is a validated string, so it can no longer be `{ $ne: null }`
    // (SEC-006). The type is the boundary; `sanitizeFilter` is only backup.
    const user = await userModel.findOne({ email });

    // SEC-020: unknown address and wrong password produce the *same* status and
    // the *same* body. The old code answered "User doesn't exist" versus
    // "Invalid password", which enumerated the whole user base for anyone
    // willing to make two requests.
    if (!user) {
        await bcrypt.compare(password, TIMING_DECOY_HASH)
        throw new InvalidCredentialsError({ details: 'no user for that address' })
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
        throw new InvalidCredentialsError({ details: 'password mismatch' })
    }

    res.json({ success: true, token: issueToken(user) })
})

// Route for user register
const registerUser = asyncHandler(async (req, res) => {
    const { name, email, password } = req.validated.body;

    // The email is a validated string before this query runs. Previously the
    // duplicate check ran *before* `validator.isEmail`, so an operator object
    // reached `findOne` first — and a regex like `{"$regex":"(a+)+$"}` was an
    // evaluated-server-side ReDoS with no rate limit in front of it (SEC-006).
    const exists = await userModel.findOne({ email })
    if (exists) {
        throw new ConflictError('That email address is already registered')
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await new userModel({
        name,
        email,
        password: hashedPassword,
        // Explicit rather than relying on the schema default: registration must
        // never be able to mint an admin, whatever a future schema change does.
        role: 'customer',
        tokenVersion: 0,
    }).save()

    res.status(201).json({ success: true, token: issueToken(user) })
})

// Route for admin Login
const adminLogin = asyncHandler(async (req, res) => {
    const { email, password } = req.validated.body

    // The admin is an ordinary user document with `role: 'admin'` and a bcrypt
    // hash. There is no environment variable to compare against any more, and
    // therefore no credential to put in the token (SEC-001).
    const user = await userModel.findOne({ email })

    if (!user || user.role !== 'admin') {
        await bcrypt.compare(password, TIMING_DECOY_HASH)
        throw new InvalidCredentialsError({ details: 'no admin user for that address' })
    }

    const isMatch = await bcrypt.compare(password, user.password)
    if (!isMatch) {
        throw new InvalidCredentialsError({ details: 'admin password mismatch' })
    }

    res.json({ success: true, token: issueToken(user) })
})

/**
 * Server-verified admin session (SEC-012).
 *
 * The console used to render its whole shell whenever `localStorage.token` was
 * any non-empty string — the token was never inspected, so junk unlocked the
 * UI and the deception only ended at the first API call. This endpoint is the
 * thing the console asks before rendering: it is behind `adminAuth`, so
 * reaching it at all *is* the proof.
 */
const adminSession = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        admin: {
            id: req.auth.userId,
            name: req.auth.user.name,
            email: req.auth.user.email,
            role: 'admin',
        },
    })
})

/**
 * Revoke every token issued for the caller (SEC-003).
 *
 * Incrementing `tokenVersion` invalidates the presented token and every other
 * one outstanding for this user, because `resolveTokenBearer` compares the
 * version in the token with the version on the document. This is what gives
 * "log out" a server-side meaning on a system that has no session store.
 *
 * Used by both the storefront and the admin console, so there is exactly one
 * logout path (ADM-011's server half).
 */
const logoutUser = asyncHandler(async (req, res) => {
    await userModel.findByIdAndUpdate(req.auth.userId, { $inc: { tokenVersion: 1 } })
    res.json({ success: true, message: 'Signed out' })
})

// Add product to wishlist. The existence check and user write share a
// transaction with product deletion's product/user writes, so an add cannot
// commit a dangling reference in the gap between a plain read and update.
const addToWishlist = asyncHandler(async (req, res) => {
    const { productId } = req.validated.body;
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const product = await productModel.findOne({
                _id: productId,
                archived: { $ne: true },
            }).select({ _id: 1 }).session(session);
            if (!product) throw new NotFoundError('Product not found');

            const user = await userModel.findByIdAndUpdate(
                req.auth.userId,
                { $addToSet: { wishlist: productId } },
                { returnDocument: 'after', session },
            );
            if (!user) throw new NotFoundError('User not found');
        });
    } finally {
        await session.endSession();
    }

    res.json({ success: true, message: "Product added to wishlist" });
});

// Remove product from wishlist
const removeFromWishlist = asyncHandler(async (req, res) => {
    const { productId } = req.validated.body;
    const user = await userModel.findByIdAndUpdate(
        req.auth.userId,
        { $pull: { wishlist: productId } },
        { returnDocument: 'after' },
    );
    if (!user) throw new NotFoundError('User not found');

    res.json({ success: true, message: "Product removed from wishlist" });
});

// Get user's wishlist
const getWishlist = asyncHandler(async (req, res) => {
    const user = await userModel.findById(req.auth.userId);
    if (!user) throw new NotFoundError('User not found');

    res.json({ success: true, wishlist: user.wishlist });
});

export {
    loginUser,
    registerUser,
    adminLogin,
    adminSession,
    logoutUser,
    addToWishlist,
    removeFromWishlist,
    getWishlist,
}
