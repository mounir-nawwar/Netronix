import { createContext } from 'react'

// TEST-002 — the context object and the guest-cart reader used to be exported
// from `ShopContext.jsx` alongside the provider component. That is what
// `react-refresh/only-export-components` reports: a module that exports both a
// component and something else cannot be hot-replaced, so every edit to the
// provider does a full page reload and loses the state a developer was
// debugging.
//
// Splitting the non-component exports out is the fix the rule is actually
// asking for. Nothing about the runtime changes — `ShopContext.jsx` imports
// from here and remains the only place the provider lives.

export const ShopContext = createContext()

/** Where the guest cart lives between visits. */
export const GUEST_CART_KEY = 'guestCart'
export const TOKEN_KEY = 'token'
