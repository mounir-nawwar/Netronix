// The storefront's toast façade (PERF-003).
//
// The defect this fixes is a delivery one, not a behavioural one.
// `react-toastify` was a static import of `ShopContext` and of six pages, and
// its stylesheet was a static import of `App.jsx`. Because the context is
// mounted by `main.jsx`, that put **9.8 kB gzip of JavaScript and a
// render-blocking 3 kB stylesheet in front of the first paint of every route**
// — to render notifications that, by definition, only exist after somebody has
// done something. Lighthouse attributed 174 ms of render-blocking time to the
// stylesheet alone, on the homepage, the product page and the cart alike.
//
// Nothing about the notifications changes. Every call site still writes
// `toast.error('…')` and still gets the same toast, in the same place, with the
// same styling. The only difference is when the library arrives: the first call
// pulls it in, and `react-toastify` buffers toasts raised before a container is
// mounted (`bt() || F.push(...)` in its own source), so the first message is
// never the one that gets lost.
//
// `ToastHost` is the other half — it is what puts the container on the page.

/** The methods the storefront actually uses. Adding one here is enough. */
const METHODS = ['success', 'error', 'info', 'warning']

/** `react-toastify`'s own `toast`, once it has been fetched. */
let delivered = null

/** In-flight import, so twenty toasts in a row fetch the library once. */
let loading = null

/** Raised before the library arrived, replayed in order once it has. */
const waiting = []

/** `ToastHost`'s listener — and whether it missed the call that woke us. */
let listener = null
let requestedBeforeListener = false

/**
 * Tell `ToastHost` the page needs a toast container now.
 * Returns the unsubscribe function `useEffect` wants.
 */
export function onToastNeeded(notify) {
    listener = notify
    if (requestedBeforeListener) {
        requestedBeforeListener = false
        notify()
    }
    return () => { listener = null }
}

function wake() {
    if (listener) listener()
    else requestedBeforeListener = true
}

function fetchLibrary() {
    loading ??= import('react-toastify').then((module) => {
        delivered = module.toast
        while (waiting.length > 0) {
            const [method, args] = waiting.shift()
            delivered[method](...args)
        }
        return module
    })
    return loading
}

function forward(method) {
    return (...args) => {
        wake()
        if (delivered) return delivered[method](...args)
        waiting.push([method, args])
        fetchLibrary()
        return undefined
    }
}

export const toast = Object.freeze(
    Object.fromEntries(METHODS.map((method) => [method, forward(method)])),
)

export default toast
