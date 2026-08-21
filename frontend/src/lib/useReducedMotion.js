// A11Y-001 — one place that answers "does this visitor want less motion?".
//
// `framer-motion` ships its own `useReducedMotion`, and `<MotionConfig
// reducedMotion="user">` in `main.jsx` makes every `framer-motion` animation
// honour the preference without a per-component change. That covers the
// staggered entrances, and nothing else: the marquee is a CSS animation, the
// scrolling text is a `requestAnimationFrame` loop, the hero is a third-party
// `<iframe>`, and the product video is a `<video autoplay>`. Each of those has
// to *decide* something — not render a smaller distance — so they read this
// hook and take a different branch.
//
// It is deliberately not a framer-motion re-export: `src/lib` is imported by
// tests and by the shared helpers, and a media-query hook should not pull an
// animation library in behind it.

import { useEffect, useState } from 'react'

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/**
 * A synchronous read, for the initial state and for non-React callers.
 * Guarded because jsdom-without-a-stub and any server render have no
 * `matchMedia`; "no preference expressed" is the correct answer there.
 */
export function prefersReducedMotion() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return Boolean(window.matchMedia(REDUCED_MOTION_QUERY).matches)
}

/**
 * `true` when the visitor has asked their operating system for reduced motion,
 * kept in sync if they change it while the page is open.
 */
export default function useReducedMotion() {
    const [reduced, setReduced] = useState(prefersReducedMotion)

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined

        const query = window.matchMedia(REDUCED_MOTION_QUERY)
        const onChange = (event) => setReduced(Boolean(event.matches))

        // Re-read on subscribe: the preference can have changed between the
        // initial state and this effect.
        setReduced(Boolean(query.matches))

        // Safari below 14 has only the deprecated listener API, and jsdom
        // stubs vary in which they provide.
        if (typeof query.addEventListener === 'function') {
            query.addEventListener('change', onChange)
            return () => query.removeEventListener('change', onChange)
        }
        if (typeof query.addListener === 'function') {
            query.addListener(onChange)
            return () => query.removeListener(onChange)
        }
        return undefined
    }, [])

    return reduced
}
