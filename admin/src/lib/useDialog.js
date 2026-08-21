import { useEffect, useRef } from 'react'

// A11Y-002 — one dialog primitive, shared.
//
// The audit found four surfaces with the same three holes: the chat, the admin
// inventory modal, the mobile menu and the search overlay. None had
// `role="dialog"`, none trapped focus, and none put focus back where it came
// from. The admin modal was the worst of them — a keyboard user who opened it
// could not leave it.
//
// The plan suggested adopting Radix or React Aria. This is deliberately not
// that: those bring a runtime and a styling contract into a project whose whole
// point is its bespoke look, to solve a problem that is about sixty lines of
// well-understood DOM. What matters is that there is exactly **one**
// implementation, tested once, rather than four hand-rolled ones — which is
// what the plan was actually asking for.
//
// What it does, in order:
//   * records the element that had focus when the dialog opened;
//   * moves focus to the first focusable thing inside it (or the container);
//   * keeps Tab and Shift+Tab inside it;
//   * closes on Escape;
//   * restores focus to the opener when it closes, if that element still
//     exists — a check that matters, because the opener is often a button the
//     dialog's own state change has just unmounted.

const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ')

/** Focusable descendants, in document order, that are actually rendered. */
export function focusableWithin(container) {
    if (!container) return []
    return [...container.querySelectorAll(FOCUSABLE)].filter(
        (element) => !element.hasAttribute('inert') && element.getAttribute('aria-hidden') !== 'true',
    )
}

/**
 * @param {object}   options
 * @param {boolean}  options.open      Whether the dialog is on screen.
 * @param {Function} options.onClose   Called on Escape.
 * @param {boolean}  [options.lockScroll]  Also freeze the page behind it.
 * @returns {{ ref: import('react').RefObject<HTMLElement> }} attach to the dialog element
 */
export default function useDialog({ open, onClose, lockScroll = false }) {
    const ref = useRef(null)
    const openerRef = useRef(null)
    const onCloseRef = useRef(onClose)

    // Kept in a ref so a caller passing an inline arrow does not re-run the
    // effect — and therefore does not re-steal focus — on every render.
    useEffect(() => { onCloseRef.current = onClose }, [onClose])

    useEffect(() => {
        if (!open) return undefined

        const container = ref.current
        openerRef.current = document.activeElement

        const first = focusableWithin(container)[0]
        if (first) first.focus()
        else if (container) {
            if (!container.hasAttribute('tabindex')) container.setAttribute('tabindex', '-1')
            container.focus()
        }

        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.stopPropagation()
                onCloseRef.current?.()
                return
            }
            if (event.key !== 'Tab') return

            const focusable = focusableWithin(ref.current)
            if (focusable.length === 0) {
                // Nothing to move to: keep focus on the dialog rather than
                // letting Tab walk out into the page behind it.
                event.preventDefault()
                return
            }

            const firstElement = focusable[0]
            const lastElement = focusable[focusable.length - 1]
            const active = document.activeElement

            if (!ref.current?.contains(active)) {
                event.preventDefault()
                firstElement.focus()
                return
            }
            if (event.shiftKey && active === firstElement) {
                event.preventDefault()
                lastElement.focus()
            } else if (!event.shiftKey && active === lastElement) {
                event.preventDefault()
                firstElement.focus()
            }
        }

        document.addEventListener('keydown', onKeyDown, true)

        const previousOverflow = lockScroll ? document.body.style.overflow : null
        if (lockScroll) document.body.style.overflow = 'hidden'

        return () => {
            document.removeEventListener('keydown', onKeyDown, true)
            if (lockScroll) document.body.style.overflow = previousOverflow ?? ''

            const opener = openerRef.current
            if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
                opener.focus()
            }
        }
    }, [open, lockScroll])

    return { ref }
}
