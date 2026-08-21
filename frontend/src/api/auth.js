// Registration, sign-in, sign-out, and the wishlist that hangs off the account.

import { post } from './client'

export async function login({ email, password }) {
    const data = await post('/api/user/login', { email, password })
    return data?.token ?? ''
}

export async function register({ name, email, password }) {
    const data = await post('/api/user/register', { name, email, password })
    return data?.token ?? ''
}

/**
 * Revoke the session server-side (SEC-003).
 *
 * Best-effort by design: the caller clears local state unconditionally, because
 * someone who clicks "log out" must end up logged out of this browser whatever
 * the network did.
 */
export async function logout() {
    try {
        await post('/api/user/logout', {})
        return true
    } catch {
        return false
    }
}

export async function fetchWishlist() {
    const data = await post('/api/user/wishlist/get', {})
    return Array.isArray(data?.wishlist) ? data.wishlist : []
}

export function addToWishlist(productId) {
    return post('/api/user/wishlist/add', { productId })
}

export function removeFromWishlist(productId) {
    return post('/api/user/wishlist/remove', { productId })
}
