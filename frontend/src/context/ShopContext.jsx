import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "../lib/toast";
import { useNavigate } from "react-router-dom"

import { backendUrl, frontendUrl as configuredFrontendUrl } from '../config'
import { ApiError, setTokenReader } from '../api/client'
import * as productsApi from '../api/products'
import * as cartApi from '../api/cart'
import * as authApi from '../api/auth'
import { DEFAULT_CURRENCY, formatMoney, multiplyMinor, readMinor, sumMinor, toMinor } from '../lib/money'
import { selectShowcase, selectShowcaseOne } from '../lib/showcase'
import { entriesOf, labelFor, resolveVariant, variantLabel, VariantResolutionError } from '../lib/variant'
import {
    GUEST_CART_LINES_KEY, legacyProjection, linesFromLegacyCart, readGuestCartLines, selectionOf,
} from '../lib/cartLines'
import { ShopContext, GUEST_CART_KEY, TOKEN_KEY } from './shopContext'
import PropTypes from 'prop-types'

/**
 * Read the guest cart, discarding anything that is not a cart (FE-009).
 *
 * `localStorage` is editable by anyone with devtools and survives across
 * versions of this application, so what comes out of it is untrusted input. The
 * previous version parsed it inside a `try` that logged and moved on, leaving a
 * corrupt value in place to fail again on the next load.
 */
function readGuestCart(storage = localStorage) {
    let raw
    try {
        raw = storage.getItem(GUEST_CART_KEY)
    } catch {
        return {}
    }
    if (!raw) return {}

    try {
        const parsed = JSON.parse(raw)
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not a cart')

        // One level deeper: `{ productId: { variantKey: quantity } }`, with
        // every quantity a positive number. A malformed line is dropped rather
        // than allowed to reach the cart maths as NaN.
        const cart = {}
        for (const [productId, variants] of Object.entries(parsed)) {
            if (!variants || typeof variants !== 'object' || Array.isArray(variants)) continue
            const kept = {}
            for (const [variantKey, quantity] of Object.entries(variants)) {
                const amount = Number(quantity)
                if (Number.isFinite(amount) && amount > 0) kept[variantKey] = amount
            }
            if (Object.keys(kept).length > 0) cart[productId] = kept
        }
        return cart
    } catch {
        // Unparseable is unrecoverable. Clear it, so the same failure does not
        // repeat on every load for the rest of this browser's life.
        try { storage.removeItem(GUEST_CART_KEY) } catch { /* nothing to clear */ }
        return {}
    }
}

const ShopContextProvider = (props) => {
    // `currency` stays a symbol because a dozen components interpolate it, and
    // Phase 2 does not redesign them. Every *total* is formatted through
    // `formatPrice` below, which is `Intl.NumberFormat` (DB-004, FE-018).
    const currency = '$';
    const currencyCode = DEFAULT_CURRENCY;
    // Presentational only. The server applies the fee itself (SEC-002); this is
    // the same number in the same units, shown to the customer before checkout.
    const deliveryFeeMinor = 300;
    const delivery_fee = deliveryFeeMinor / 100;
    // Validated at startup by src/config.js (DEVOPS-002, FE-008).
    const frontendUrl = configuredFrontendUrl || window.location.origin;

    const [search, setSearch] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    /**
     * The cart, losslessly (DB-003).
     *
     * A line used to be a number under a hyphen-joined key, so for a catalog
     * containing `["16-inch","16"] × ["1TB","inch-1TB"]` the combinations
     * `16-inch + 1TB` and `16 + inch-1TB` were the *same line* — adding the
     * second overwrote the first, and checkout had to reconstruct the options
     * from the key and refuse when it could not. The identity is kept here at
     * the moment the customer chooses it.
     */
    const [cartLines, setCartLines] = useState([]);
    const [products, setProducts] = useState([]);
    const [tags, setTags] = useState([]);
    const [token, setToken] = useState('')
    const [wishlist, setWishlist] = useState([]);
    // Every whole-session adoption owns a generation. Network responses may
    // arrive after logout or after another account has been adopted; only the
    // generation that started them may publish private state.
    const sessionGeneration = useRef(0)

    /**
     * The catalog request's lifecycle, as state (FE-012, FE-013).
     *
     * Surfaces used to guess. `Cart` ran a 300 ms timer and then declared the
     * cart empty whether the catalog had arrived or not; `Wishlist` only ever
     * cleared its spinner *inside* `if (products.length > 0)`, so an empty
     * catalog span forever. Neither could tell "loading" from "empty" because
     * nothing told them which it was.
     */
    const [catalogStatus, setCatalogStatus] = useState('loading');
    const [catalogError, setCatalogError] = useState(null);
    const [wishlistStatus, setWishlistStatus] = useState('idle');

    const navigate = useNavigate();

    /**
     * The live cart, readable synchronously.
     *
     * `addToCart` used to clone the `cartItems` it closed over, so two calls in
     * one commit both started from the same value and the second discarded the
     * first. Updates go through the functional form now; the ref exists because
     * the same handler also has to *persist* the result and show it in a toast,
     * and neither can wait for a re-render.
     */
    const cartLinesRef = useRef(cartLines)
    useEffect(() => { cartLinesRef.current = cartLines }, [cartLines])

    // Authenticated writes are serialized per line. Each queue keeps the last
    // server-confirmed quantity plus the still-optimistic operations layered on
    // top of it, so a failed write removes only its own effect.
    const cartMutationQueues = useRef(new Map())
    const cartMutationEpoch = useRef(0)

    const cancelCartMutations = useCallback(() => {
        cartMutationEpoch.current += 1
        for (const queue of cartMutationQueues.current.values()) {
            for (const operation of queue.pending) operation.resolve()
        }
        cartMutationQueues.current.clear()
    }, [])

    /**
     * The legacy `{ productId: { legacyKey: quantity } }` view.
     *
     * Derived, never stored, so the two cannot drift. It is lossy by
     * construction — two lines whose keys collide are summed under the one key,
     * because the legacy shape has no way to hold both — which is exactly why
     * `cartLines` exists.
     */
    const cartItems = useMemo(() => legacyProjection(cartLines), [cartLines])

    /** Replace the whole cart from a legacy map. Kept for existing callers. */
    const setCartItems = useCallback((next) => {
        cancelCartMutations()
        const value = typeof next === 'function' ? next(legacyProjection(cartLinesRef.current)) : next
        const lines = linesFromLegacyCart(value)
        cartLinesRef.current = lines
        setCartLines(lines)
    }, [cancelCartMutations])

    /** The token, for the API client's request interceptor. */
    const tokenRef = useRef(token)
    useEffect(() => {
        tokenRef.current = token
        setTokenReader(() => tokenRef.current || localStorage.getItem(TOKEN_KEY) || '')
    }, [token])

    /** Guard: the save effect must not run before the load effect has. */
    const guestCartLoaded = useRef(false)

    // ---------------------------------------------------------------- errors

    /**
     * Report a failure to the person and to the console (FE-024).
     *
     * Every network call in this file used to end in `toast.error(error.message)`
     * — which shows a customer "Request failed with status code 500" — or, in
     * `getCartCount` and `getCartAmount`, in an **empty catch** that silently
     * counted the line as zero. A cart that quietly reports the wrong total is
     * worse than one that says it could not load.
     */
    const report = useCallback((error, fallback) => {
        const message = error instanceof ApiError ? error.message : fallback
        console.error(fallback, error)
        toast.error(message || fallback)
        return message || fallback
    }, [])

    // ------------------------------------------------------------ navigation

    /**
     * Navigate, closing the search overlay on the way (FE-005).
     *
     * `navigateWithContext(-1)` called `path.includes('products')` on a number,
     * which throws; the `catch` then fell back to `window.location.href = -1`,
     * i.e. a full page load of `/-1` and a blank screen. The Wishlist back
     * button did exactly that. A number is now handed to the router, which is
     * what `navigate(-1)` means, and there is no `window.location` fallback at
     * all — a router failure is a bug to see, not one to paper over with a full
     * page load.
     */
    const navigateWithContext = useCallback((path, options = {}) => {
        if (typeof path === 'number') {
            navigate(path);
            return;
        }

        if (!options.keepSearchOpen) setShowSearch(false);
        if (!String(path).includes('products') && !options.keepSearchTerm) setSearch('');

        navigate(path);
    }, [navigate]);

    /** One step back through router history. Used by Wishlist and BackButton. */
    const goBack = useCallback(() => navigate(-1), [navigate]);

    // ----------------------------------------------------------- guest cart

    // Load the guest cart once, and again whenever the session ends.
    useEffect(() => {
        if (token) return;
        // The lossless copy wins when this browser has one; otherwise the cart
        // a previous bundle left behind is read as lines with no identity
        // invented for any of them.
        const stored = readGuestCartLines() ?? linesFromLegacyCart(readGuestCart());
        cartLinesRef.current = stored;
        setCartLines(stored);
        guestCartLoaded.current = true;
    }, [token]);

    /**
     * Persist the guest cart — including when it becomes empty (FE-009).
     *
     * The save was guarded by `Object.keys(cartItems).length > 0`, so removing
     * the last item left the previous value in storage and the item reappeared
     * on the next load. Emptying the cart now **removes** the key, which is the
     * one state that cannot resurrect anything.
     */
    useEffect(() => {
        if (token || !guestCartLoaded.current) return;
        try {
            if (cartLines.length === 0) {
                localStorage.removeItem(GUEST_CART_KEY);
                localStorage.removeItem(GUEST_CART_LINES_KEY);
                return;
            }
            // Both, for the length of the rollout: the lossless list, and the
            // legacy map a cached bundle would read.
            localStorage.setItem(GUEST_CART_LINES_KEY, JSON.stringify(cartLines));
            localStorage.setItem(GUEST_CART_KEY, JSON.stringify(legacyProjection(cartLines)));
        } catch (error) {
            console.error('Could not save the cart to this browser', error);
        }
    }, [cartLines, token]);

    // -------------------------------------------------------------- catalog

    const loadCatalog = useCallback(async () => {
        setCatalogStatus('loading');
        setCatalogError(null);
        try {
            // Walked, not sampled. One request returns one bounded page
            // (BE-009), and rendering that as the catalog silently hid every
            // product past the hundredth from search, collections and the
            // homepage alike.
            const catalog = await productsApi.listAllProducts();
            if (catalog.truncated) {
                throw new ApiError(
                    `Product catalog is incomplete: received ${catalog.items.length} of ${catalog.total}`,
                    { code: 'CATALOG_TRUNCATED' },
                );
            }
            const { items } = catalog;
            // PERF-003 — `startTransition`, because this one `setProducts` is
            // the largest single piece of work the storefront ever does.
            //
            // The catalog arrives after the first paint and every consumer of
            // this context re-renders on it: on the homepage that is the
            // slider, the featured grid and its product cards, the film and
            // Shop the Look, in **one uninterruptible render**. Lighthouse
            // measured it as a single 365 ms main-thread task on a mobile
            // profile — and total blocking time counts every millisecond of a
            // task past its first fifty, so one long task is charged far more
            // than the same work split across several short ones.
            //
            // Marking it as a transition is what lets React 18 do that
            // splitting: the render becomes interruptible and yields to the
            // browser between slices, so a tap or a scroll during the load is
            // answered instead of queued. Nothing about the result changes —
            // the same products, the same components, committed in one
            // consistent pass. It is *only* a statement that this update is
            // not more urgent than the visitor.
            startTransition(() => {
                setProducts(items);
                setCatalogStatus('ready');
            });
            return items;
        } catch (error) {
            setProducts([]);
            setCatalogError(error instanceof ApiError ? error.message : 'Error loading products');
            setCatalogStatus('error');
            report(error, 'Error loading products');
            return [];
        }
    }, [report]);

    /** The filter taxonomy, from the real endpoint — never a hand-written list. */
    const loadTags = useCallback(async () => {
        try {
            // Same reasoning as the catalog above: the tag list re-renders the
            // navigation's category menu and every filter sidebar, after the
            // page is already on screen.
            const loaded = await productsApi.listTags();
            startTransition(() => setTags(loaded));
        } catch (error) {
            // A missing taxonomy narrows the filter sidebar; it does not stop
            // anyone browsing, so this one is logged rather than shouted about.
            console.error('Error loading tags', error);
        }
    }, []);

    // ------------------------------------------------------------------ cart

    /**
     * Available stock for a combination, or `null` when the catalog cannot
     * identify it (DB-003).
     *
     * `null` is not zero. An unresolvable key means "we do not know", and the
     * caller says so rather than claiming the item is out of stock — or, as the
     * old `isOutOfStock` did on a hyphenated option, claiming it is in stock.
     */
    const availableFor = useCallback((product, selection) => {
        if (!product) return null;
        try {
            return resolveVariant(product, selectionOf(selection)).quantity;
        } catch (error) {
            if (error instanceof VariantResolutionError) return null;
            throw error;
        }
    }, []);

    /**
     * "Storage: 1TB" for a cart or order line.
     *
     * Reads the resolved combination's own option pairs, so `16-inch` and
     * `RTX-4090` render correctly. The old implementation split the key on "-"
     * and bailed out to the raw key whenever the segment count disagreed with
     * the axis count, which a hyphenated option guarantees.
     */
    const getVariantDisplayName = useCallback((product, variantKey) => {
        if (!product || !variantKey) return variantKey;
        return labelFor(product, { variantKey }) || variantKey;
    }, []);

    /** The typed combinations a product has, for any consumer that needs them. */
    const getVariantEntries = useCallback((product) => entriesOf(product ?? {}), [])

    /**
     * The exact minor-unit price of a product, in either representation.
     *
     * Dual-read: a catalog document written after the migration carries
     * `priceMinor`; one written before carries only `price` (DB-004).
     */
    const getPriceMinor = useCallback((product, variantKey = null) => {
        let delta = 0;
        if (variantKey && Array.isArray(product?.inventoryV2)) {
            const variant = product.inventoryV2.find(v => v.variantId === variantKey || v.legacyKey === variantKey);
            if (variant) {
                if (Number.isFinite(variant.priceMinorDelta) && variant.priceMinorDelta !== 0) {
                    delta = variant.priceMinorDelta;
                } else if (Number.isFinite(variant.priceDelta)) {
                    delta = Math.round(variant.priceDelta * 100);
                }
            }
        }
        return (readMinor(product ?? {}, 'priceMinor', 'price') ?? 0) + delta;
    }, [])

    /** Format for display. `Intl.NumberFormat`, never concatenation (FE-018). */
    const formatPrice = useCallback((minor) => formatMoney(minor, { currency: currencyCode }), [currencyCode])

    /** Format a major-unit figure that has not been converted yet. */
    const formatPriceMajor = useCallback(
        (major) => formatMoney(toMinor(Number(major) || 0), { currency: currencyCode }),
        [currencyCode],
    )

    /** Whether a stored line is the one an identity names. */
    const sameLine = useCallback((line, productId, identity) => {
        if (String(line.productId) !== String(productId)) return false;
        if (identity.variantId !== undefined && identity.variantId !== null) {
            return line.variantId === identity.variantId;
        }
        return (line.variantId ?? null) === null && (line.variantKey ?? '') === (identity.variantKey ?? '');
    }, []);

    const mutationIdentity = useCallback((productId, identity) => {
        const variant = identity.variantId !== undefined && identity.variantId !== null
            ? `id:${identity.variantId}`
            : `legacy:${identity.variantKey ?? ''}`
        return `${String(productId)}::${variant}`
    }, [])

    const enqueueCartMutation = useCallback(({
        productId, identity, template, baseQuantity, apply, request, failureMessage,
    }) => {
        const key = mutationIdentity(productId, identity)
        let queue = cartMutationQueues.current.get(key)
        if (!queue) {
            queue = {
                confirmedQuantity: baseQuantity,
                pending: [],
                processing: false,
                template,
                epoch: cartMutationEpoch.current,
            }
            cartMutationQueues.current.set(key, queue)
        }
        queue.template = template

        const settled = new Promise((resolve) => {
            queue.pending.push({ apply, request, resolve, failureMessage })
        })

        const drain = async () => {
            if (queue.processing) return
            queue.processing = true
            while (queue.pending.length > 0) {
                const operation = queue.pending[0]
                let accepted = false
                let failure = null
                try {
                    await operation.request()
                    accepted = true
                } catch (error) {
                    failure = error
                }

                // Logout, checkout completion, or another whole-cart adoption
                // invalidates responses from the previous cart/session.
                if (queue.epoch !== cartMutationEpoch.current) {
                    queue.processing = false
                    return
                }
                if (failure) report(failure, operation.failureMessage)

                if (accepted) queue.confirmedQuantity = operation.apply(queue.confirmedQuantity)
                queue.pending.shift()

                const displayedQuantity = queue.pending.reduce(
                    (quantity, pending) => pending.apply(quantity),
                    queue.confirmedQuantity,
                )
                const current = cartLinesRef.current
                const index = current.findIndex((line) => sameLine(line, productId, identity))
                const reconciled = displayedQuantity > 0
                    ? (index === -1
                        ? [...current, { ...queue.template, quantity: displayedQuantity }]
                        : current.map((line, at) => (at === index
                            ? { ...line, ...queue.template, quantity: displayedQuantity }
                            : line)))
                    : current.filter((line) => !sameLine(line, productId, identity))
                cartLinesRef.current = reconciled
                setCartLines(reconciled)
                operation.resolve()
            }
            queue.processing = false
            if (cartMutationQueues.current.get(key) === queue) cartMutationQueues.current.delete(key)
        }
        void drain()
        return settled
    }, [mutationIdentity, report, sameLine])

    /**
     * The cart with everything the catalog can say about it.
     *
     * A line stored with a canonical identity is already complete. A line
     * recovered from a legacy key is resolved here: if the key names exactly one
     * combination it gains its options — recovering a *unique* answer is not
     * guessing — and if it names none or more than one it is marked instead, so
     * the cart can say what is wrong rather than showing "0 available" for
     * something it cannot even identify.
     */
    const resolvedLines = useMemo(() => cartLines.map((line) => {
        const product = products.find((candidate) => candidate._id === String(line.productId));
        if (!product) return { ...line, unresolvable: 'PRODUCT_GONE' };

        try {
            const entry = resolveVariant(product, {
                variantOptions: line.variantOptions ?? undefined,
                variantId: line.variantId ?? undefined,
                ...(line.variantId === null && line.variantOptions === null ? { variantKey: line.variantKey } : {}),
            });
            return {
                ...line,
                variantId: line.variantId ?? entry.variantId,
                variantOptions: line.variantOptions ?? entry.options,
                variantLabel: variantLabel(product.variants, line.variantOptions ?? entry.options),
                available: entry.quantity,
                unresolvable: null,
            };
        } catch (error) {
            if (!(error instanceof VariantResolutionError)) throw error;
            return { ...line, available: null, unresolvable: error.code };
        }
    }), [cartLines, products]);

    const addToCart = useCallback(async (itemId, selection = '', quantity = 1) => {
        const product = products.find(p => p._id === itemId);
        if (!product) {
            toast.error('Product not found');
            return;
        }

        /*
         * A product with no axes could not be bought at all.
         *
         * The guard here was `if (!variantKey) return`, and a variantless
         * product's only combination has the *empty* legacy key — that is what
         * `deriveInventoryV2` produces for `inventory: { '': 11 }`, and what
         * the server stores. So `Product.jsx` correctly enabled "ADD TO CART",
         * correctly called `addToCart(id, '')`, and this line threw the click
         * away with "Select Product Options" — for a product that has no
         * options to select. Every accessory in the catalog was unbuyable.
         *
         * Found by the browser end-to-end suite, and only there: the unit tests
         * all used products with variants, and the server accepts `''` happily.
         *
         * The question a missing key actually asks is "has the customer chosen
         * yet", which only means anything when there is something to choose.
         */
        const { variantOptions, variantKey } = selectionOf(selection);

        const needsSelection = Array.isArray(product.variants) && product.variants.length > 0;
        if (needsSelection && !variantKey && !variantOptions) {
            toast.error('Select Product Options')
            return;
        }

        // DB-003. `product.inventory[variantKey]` was a lookup into an untyped
        // bag keyed by option values joined with "-", so a hyphenated option
        // such as "16-inch" produced a key that matched nothing and the guard
        // read as "out of stock" or, worse in `Product.isOutOfStock`, as "in
        // stock". Resolution goes through the shared helper, which fails closed:
        // an unknown or ambiguous combination throws rather than guessing.
        let entry;
        try {
            entry = resolveVariant(product, { variantOptions, variantKey });
        } catch (error) {
            if (!(error instanceof VariantResolutionError)) throw error;
            toast.error('That option is no longer available');
            return;
        }

        const available = entry.quantity;
        if (available <= 0) {
            toast.error(`Selected variant is out of stock`);
            return;
        }

        // The line the customer chose, named by what they chose — the canonical
        // identity **and** the option pairs themselves, so nothing downstream
        // has to reconstruct them from a hyphen-joined key that two different
        // combinations can share.
        const identity = { variantId: entry.variantId };
        const template = {
            productId: String(itemId),
            variantId: entry.variantId,
            variantOptions: entry.options,
            variantKey: entry.legacyKey,
        };

        const previousLines = cartLinesRef.current;
        const index = previousLines.findIndex((line) => sameLine(line, itemId, identity));
        const currentQuantityInCart = index === -1 ? 0 : Number(previousLines[index].quantity);

        if (currentQuantityInCart + quantity > available) {
            toast.error(`Cannot add ${quantity} items. Only ${available - currentQuantityInCart} more available for this variant`);
            return;
        }

        const nextLines = index === -1
            ? [...previousLines, { ...template, quantity }]
            : previousLines.map((line, at) => (at === index
                ? { ...line, ...template, quantity: currentQuantityInCart + quantity }
                : line));

        cartLinesRef.current = nextLines;
        setCartLines(nextLines);

        // The label comes from the resolved combination, not from splitting the
        // key on "-" and zipping it against the axes — which is what produced
        // "Size: 16, Storage: inch" for a 16-inch laptop (DB-003).
        const variantDisplay = variantLabel(product.variants, entry.options) || 'Default';

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

        if (!token) return;   // the guest cart is persisted by its own effect

        // FE-019 — awaited, so a failure is caught rather than becoming an
        // unhandled rejection, and the optimistic state is rolled back rather
        // than left showing an item the server never accepted.
        await enqueueCartMutation({
            productId: itemId,
            identity,
            template,
            baseQuantity: currentQuantityInCart,
            apply: (confirmed) => confirmed + quantity,
            // The options, not the key: the server resolves the same combination
            // this did, rather than one of the ones the key could mean.
            request: () => cartApi.addCartItem({ itemId, variantOptions: entry.options, quantity }),
            failureMessage: 'Could not add that to your cart',
        })
    }, [enqueueCartMutation, products, sameLine, token])

    const getCartCount = useCallback(() => {
        let totalCount = 0;
        for (const productId in cartItems) {
            for (const variantKey in cartItems[productId]) {
                // FE-024 — this loop body used to sit inside an empty `catch`,
                // so a line that failed to add was silently counted as nothing.
                const quantity = Number(cartItems[productId][variantKey]);
                if (Number.isFinite(quantity) && quantity > 0) totalCount += quantity;
            }
        }
        return totalCount;
    }, [cartItems])

    /**
     * Change one line's quantity, or remove it.
     *
     * `reference` is a line, a `{ variantId }`, or — for every call site written
     * before the cart could name a combination — the legacy key as a string.
     */
    const updateQuantity = useCallback(async (itemId, reference, quantity) => {
        const previous = cartLinesRef.current;
        const { variantId, variantKey } = selectionOf(reference);

        const index = previous.findIndex((line) => (variantId
            ? line.variantId === variantId && String(line.productId) === String(itemId)
            : sameLine(line, itemId, { variantKey })
                || (String(line.productId) === String(itemId) && (line.variantKey ?? '') === (variantKey ?? ''))));

        if (index === -1) return;

        const line = previous[index];
        const next = quantity > 0
            ? previous.map((candidate, at) => (at === index ? { ...candidate, quantity } : candidate))
            : previous.filter((unused, at) => at !== index);

        cartLinesRef.current = next;
        setCartLines(next);

        if (!token) return;

        const identity = variantId !== undefined && variantId !== null
            ? { variantId }
            : { variantKey: line.variantKey ?? variantKey ?? '' }
        // FE-019 — the axios call was inside a `try` but never awaited, so the
        // `catch` could not see its rejection: a failed update showed as a
        // success and the two carts drifted apart until checkout.
        await enqueueCartMutation({
            productId: itemId,
            identity,
            template: line,
            baseQuantity: Number(line.quantity),
            apply: () => quantity,
            request: () => cartApi.updateCartItem({
                itemId,
                // The options when the line has them, so the server changes the
                // line the customer is looking at and not one that merely shares
                // its legacy key.
                ...(line.variantOptions ? { variantOptions: line.variantOptions } : { variantKey: line.variantKey ?? '' }),
                quantity,
            }),
            failureMessage: 'Could not update your cart',
        })
    }, [enqueueCartMutation, sameLine, token])

    /**
     * The cart subtotal in exact integer minor units (DB-004).
     *
     * This used to accumulate `itemInfo.price * qty` across an unbounded number
     * of lines in floating point, and the result was persisted verbatim.
     * `0.1 + 0.2` is `0.30000000000000004`; a long enough cart drifts. Integers
     * do not.
     */
    const getCartAmountMinor = useCallback(() => {
        const lines = [];
        for (const productId in cartItems) {
            const itemInfo = products.find((product) => product._id === productId);
            // A product the catalog has not produced is not worth zero — it is
            // unknown. Counting it as zero is how a cart quietly under-reports
            // its own total (FE-024); the caller is told instead.
            if (!itemInfo) continue;
            for (const variantKey in cartItems[productId]) {
                const quantity = Number(cartItems[productId][variantKey]) || 0;
                if (quantity > 0) {
                    const unit = getPriceMinor(itemInfo, variantKey);
                    lines.push(multiplyMinor(unit, quantity));
                }
            }
        }
        return sumMinor(lines);
    }, [cartItems, getPriceMinor, products])

    /**
     * Cart lines whose product the catalog cannot price (FE-024).
     *
     * Surfaced rather than silently skipped, so a total that is missing a line
     * says so instead of simply being wrong.
     */
    const getUnpricedCartLines = useCallback(() => {
        const unpriced = [];
        for (const productId in cartItems) {
            if (products.some((product) => product._id === productId)) continue;
            for (const variantKey in cartItems[productId]) {
                if (Number(cartItems[productId][variantKey]) > 0) unpriced.push({ productId, variantKey });
            }
        }
        return unpriced;
    }, [cartItems, products])

    /**
     * The same figure in major units.
     *
     * Kept because several components still interpolate it directly. It is
     * derived from the exact integer rather than accumulated independently, so
     * the two can never disagree.
     */
    const getCartAmount = useCallback(() => getCartAmountMinor() / 100, [getCartAmountMinor])

    /** A product from the loaded catalog, or one fetched on demand. */
    const getSingleProduct = useCallback(async (productId) => {
        const existing = products.find(p => p._id === productId);
        if (existing) return existing;

        try {
            return await productsApi.fetchProduct(productId);
        } catch (error) {
            report(error, 'Error loading product');
            return null;
        }
    }, [products, report])

    const getProductsByTag = useCallback(async (tag) => {
        try {
            const { items } = await productsApi.listProductsByTag(tag);
            return items;
        } catch (error) {
            report(error, 'Error loading products');
            return [];
        }
    }, [report])

    // -------------------------------------------------------------- showcase

    /**
     * The products a homepage surface should render (FE-004).
     *
     * Read straight off the catalog the context already holds, so no section
     * issues a request of its own — which is what five of them used to do, each
     * pulling the whole catalog to find one product by hardcoded id.
     */
    const showcase = useCallback((slot, options) => selectShowcase(products, slot, options), [products])
    const showcaseOne = useCallback((slot) => selectShowcaseOne(products, slot), [products])

    // ------------------------------------------------------------- wishlist

    const loadWishlist = useCallback(async (generation = sessionGeneration.current) => {
        if (!tokenRef.current) {
            setWishlist([]);
            setWishlistStatus('ready');
            return;
        }
        setWishlistStatus('loading');
        try {
            const loaded = await authApi.fetchWishlist();
            if (generation !== sessionGeneration.current) return;
            setWishlist(loaded);
            setWishlistStatus('ready');
        } catch (error) {
            if (generation !== sessionGeneration.current) return;
            // FE-013 — it has to *settle*, whichever way it went. The old
            // version left the page's spinner running for ever on any path that
            // did not produce products.
            setWishlistStatus('error');
            report(error, 'Could not load your saved items');
        }
    }, [report]);

    const addToWishlist = useCallback(async (productId) => {
        if (!token) {
            toast.error('Please log in to save items');
            navigate('/login');
            return;
        }

        try {
            await authApi.addToWishlist(productId);
            setWishlist((previous) => (previous.includes(productId) ? previous : [...previous, productId]));

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
        } catch (error) {
            report(error, 'Could not save that item');
        }
    }, [navigate, products, report, token]);

    const removeFromWishlist = useCallback(async (productId) => {
        if (!token) return;

        try {
            await authApi.removeFromWishlist(productId);
            setWishlist((previous) => previous.filter(id => id !== productId));
            toast.info('Item removed from wishlist');
        } catch (error) {
            report(error, 'Could not remove that item');
        }
    }, [report, token]);

    const isInWishlist = useCallback((productId) => wishlist.includes(productId), [wishlist]);

    // --------------------------------------------------------------- session

    /**
     * Adopt a session, merging whatever the visitor chose before signing in
     * (FE-009).
     *
     * The old login path set the token and let an effect call `getUserCart`,
     * which replaced local state wholesale — so a guest cart was discarded at
     * exactly the moment the customer committed to the site, with no message.
     *
     * The guest copy is cleared **only after** the merge succeeds. If the merge
     * fails the cart stays in this browser, so nothing is lost and the next
     * sign-in can try again.
     */
    const applySession = useCallback(async (nextToken) => {
        if (!nextToken) return;

        const generation = sessionGeneration.current + 1;
        sessionGeneration.current = generation;

        localStorage.setItem(TOKEN_KEY, nextToken);
        tokenRef.current = nextToken;
        setToken(nextToken);

        // The lossless copy when this browser has one, so a combination the
        // customer chose as a guest is handed over as the combination they
        // chose rather than as a key two combinations can share.
        const guestLines = readGuestCartLines() ?? linesFromLegacyCart(readGuestCart());

        const adopt = (lines) => {
            if (generation !== sessionGeneration.current || tokenRef.current !== nextToken) return false;
            cartLinesRef.current = lines;
            setCartLines(lines);
            return true;
        };

        // The cart and the wishlist are independent, so they are fetched
        // together rather than one after the other — this runs on every page
        // load that restores a session, and two serial round trips is two.
        const restoreCart = async () => {
            if (guestLines.length === 0) {
                adopt(await cartApi.fetchCart());
                return;
            }

            const { cartLines: merged, capped } = await cartApi.mergeGuestCart(guestLines);
            if (!adopt(merged)) return;
            // Cleared only now: if the merge had failed, the guest cart would
            // still be in this browser and the next sign-in could try again.
            localStorage.removeItem(GUEST_CART_KEY);
            localStorage.removeItem(GUEST_CART_LINES_KEY);
            if (capped.length > 0) {
                toast.info('Some items were reduced to the quantity we have in stock');
            }
        };

        const [cartResult] = await Promise.allSettled([restoreCart(), loadWishlist(generation)]);
        if (generation === sessionGeneration.current && cartResult.status === 'rejected') {
            report(cartResult.reason, 'We signed you in, but could not load your cart');
        }
    }, [loadWishlist, report]);

    /**
     * The one way out (FE-002, SEC-022).
     *
     * There used to be no way out at all that worked. `Navbar.logout` cleared
     * the token and then called `setCartItems({})` — which the context never
     * provided — so it threw *after* clearing the token and *before* navigating:
     * the previous customer's cart stayed on screen, on a page that still looked
     * signed in. Phase 1 removed the throwing call, which fixed the token half
     * and left the cart half open. This closes it.
     *
     * Revocation is best-effort and the local clear is unconditional: someone
     * who clicks "log out" must end up logged out of this browser whatever the
     * network did.
     */
    const logout = useCallback(async () => {
        const current = tokenRef.current || localStorage.getItem(TOKEN_KEY);

        sessionGeneration.current += 1;

        localStorage.removeItem(TOKEN_KEY);
        // The previous customer's guest cart must not become the next one's.
        localStorage.removeItem(GUEST_CART_KEY);
        localStorage.removeItem(GUEST_CART_LINES_KEY);
        guestCartLoaded.current = false;
        cancelCartMutations();

        tokenRef.current = '';
        setToken('');
        setCartLines([]);
        cartLinesRef.current = [];
        setWishlist([]);
        setWishlistStatus('idle');

        try {
            if (current) await authApi.logout();
        } catch (error) {
            // Revocation is best-effort. Local session state is already gone,
            // and a network failure must not strand the customer on this page.
            console.error('Could not revoke the server session during logout', error)
        } finally {
            navigate('/login');
        }
    }, [cancelCartMutations, navigate]);

    // ----------------------------------------------------------- lifecycle

    // The catalog and the tag taxonomy, once each per application mount.
    useEffect(() => {
        loadCatalog();
        loadTags();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Restore a session from a previous visit.
    useEffect(() => {
        const stored = localStorage.getItem(TOKEN_KEY);
        if (!token && stored) applySession(stored);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * A visitor with no session has a settled, empty wishlist (FE-013).
     *
     * Without this the status stays `idle` for ever for a guest, and `Wishlist`
     * — which treats "not settled" as "loading" — spins for ever. That is the
     * finding this phase is fixing, reappearing one level up: the page can only
     * be honest about which state it is in if the context actually reaches one.
     */
    useEffect(() => {
        if (token || localStorage.getItem(TOKEN_KEY)) return;
        setWishlist([]);
        setWishlistStatus('ready');
    }, [token]);

    // FE-022 — this object was a fresh literal on every render of the
    // provider, so **every one of its consumers re-rendered whenever anything
    // in it changed** — twenty-two components, on a keystroke in the search
    // box. The functions were already `useCallback`ed; the value itself was
    // not, which made that work invisible. Memoised here, a consumer
    // re-renders when a value it reads actually changed.
    const contextValue = useMemo(() => ({
        products,
        tags,
        catalogStatus,
        catalogError,
        reloadCatalog: loadCatalog,
        showcase,
        showcaseOne,
        cartItems,
        /** The lossless cart: one entry per combination the customer chose. */
        cartLines: resolvedLines,
        setCartItems,
        addToCart,
        getCartCount,
        getCartAmount,
        getUnpricedCartLines,
        updateQuantity,
        currency,
        currencyCode,
        delivery_fee,
        deliveryFeeMinor,
        getCartAmountMinor,
        getPriceMinor,
        formatPrice,
        formatPriceMajor,
        getVariantEntries,
        availableFor,
        token,
        setToken,
        applySession,
        logout,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        wishlist,
        wishlistStatus,
        getVariantDisplayName,
        search,
        setSearch,
        showSearch,
        setShowSearch,
        navigate: navigateWithContext,
        goBack,
        getProductsByTag,
        // Constant for the lifetime of the module, so deliberately *not* in
        // the dependency array below — a value that cannot change is not a
        // reason to rebuild the memo, and listing it makes ESLint say so.
        backendUrl,
        frontendUrl,
        getSingleProduct
    }), [
        products,
        tags,
        catalogStatus,
        catalogError,
        loadCatalog,
        showcase,
        showcaseOne,
        cartItems,
        resolvedLines,
        setCartItems,
        addToCart,
        getCartCount,
        getCartAmount,
        getUnpricedCartLines,
        updateQuantity,
        currency,
        currencyCode,
        delivery_fee,
        deliveryFeeMinor,
        getCartAmountMinor,
        getPriceMinor,
        formatPrice,
        formatPriceMajor,
        getVariantEntries,
        availableFor,
        token,
        setToken,
        applySession,
        logout,
        addToWishlist,
        removeFromWishlist,
        isInWishlist,
        wishlist,
        wishlistStatus,
        getVariantDisplayName,
        search,
        setSearch,
        showSearch,
        setShowSearch,
        navigateWithContext,
        goBack,
        getProductsByTag,
        getSingleProduct,
        frontendUrl,
    ]);

    return (
        <ShopContext.Provider value={contextValue}>
            {props.children}
        </ShopContext.Provider>
    );
};

ShopContextProvider.propTypes = {
    children: PropTypes.node,
};

export default ShopContextProvider;
