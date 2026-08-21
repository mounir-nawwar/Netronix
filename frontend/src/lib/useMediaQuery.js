import { useEffect, useState } from 'react'

// A small `matchMedia` subscription, so a component can branch on a breakpoint
// without a `resize` listener.
//
// Four components used to run `window.innerWidth` resize handlers — PERF-007's
// "related render pressure" — and every one of them re-rendered on every resize
// frame. `matchMedia` fires only when the answer actually changes, which for a
// breakpoint is once per crossing rather than once per pixel.

export default function useMediaQuery(query) {
    const read = () => (
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
            ? Boolean(window.matchMedia(query).matches)
            : false
    )

    const [matches, setMatches] = useState(read)

    useEffect(() => {
        if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined

        const list = window.matchMedia(query)
        const onChange = (event) => setMatches(Boolean(event.matches))
        setMatches(Boolean(list.matches))

        if (typeof list.addEventListener === 'function') {
            list.addEventListener('change', onChange)
            return () => list.removeEventListener('change', onChange)
        }
        if (typeof list.addListener === 'function') {
            list.addListener(onChange)
            return () => list.removeListener(onChange)
        }
        return undefined
    }, [query])

    return matches
}
