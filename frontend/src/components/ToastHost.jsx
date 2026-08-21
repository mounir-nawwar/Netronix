import { Suspense, lazy, useEffect, useState } from 'react'

import { onToastNeeded } from '../lib/toast'

// PERF-003 — where the toast container comes from now.
//
// `App.jsx` used to render `<ToastContainer>` directly and import
// `ReactToastify.css` at the top of the file, so every visitor downloaded and
// parsed the notification system before the first paint of a page that had
// nothing to notify them about. This mounts the same container from a chunk
// that is fetched only when it is going to be used.
//
// **Two triggers, not one, and the second is an accessibility decision.**
// `react-toastify`'s container is an `aria-live="polite"` region. A live region
// that is inserted into the document in the same frame as its first message is
// announced unreliably by screen readers, so waiting for `toast.error(…)` alone
// would trade a measurable load cost for an unmeasurable announcement bug. The
// first pointer or key event a visitor produces also mounts it: by the time any
// action *capable* of raising a toast has happened, the region has been on the
// page for at least one frame. Nothing about a first load triggers either path,
// which is the whole point.
const ToastSurface = lazy(() => import('./ToastSurface'))

const WAKE_EVENTS = ['pointerdown', 'keydown', 'touchstart']

const ToastHost = () => {
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        if (mounted) return undefined

        const show = () => setMounted(true)
        const unsubscribe = onToastNeeded(show)
        for (const event of WAKE_EVENTS) {
            window.addEventListener(event, show, { once: true, passive: true })
        }

        return () => {
            unsubscribe()
            for (const event of WAKE_EVENTS) window.removeEventListener(event, show)
        }
    }, [mounted])

    if (!mounted) return null

    return (
        <Suspense fallback={null}>
            <ToastSurface />
        </Suspense>
    )
}

export default ToastHost
