import { forwardRef } from 'react'
import PropTypes from 'prop-types'

// The recipe `border border-ink bg-ink px-… font-michroma text-[9px] uppercase
// tracking-[0.16em] text-paper …` was typed out eight times across six files
// (`pages/Orders.jsx`, `About.jsx`, `Wishlist.jsx`, `Cart.jsx`,
// `components/NotFound.jsx`, `components/catalog/CatalogGrid.jsx`) — `Cart`
// as a local `SOLID_BUTTON` constant, everyone else inlined. A second, quieter
// recipe (`border-rule`, `text-ink`) was typed out four more times, in two
// slightly different hovers that nobody chose on purpose: two buttons filled to
// `ink` on hover (`Orders`' refresh, the grid's "Load more"/"Clear filters")
// and two only changed their border colour (`About` and the 404 page's
// secondary link). This component keeps both hovers rather than picking one and
// silently changing four buttons nobody asked to look different — `outline` is
// the fill, `quiet` is the border-only.
//
// This is the same defect shape as the four product cards (FE-007) and the
// `/collections/all`-style hand-built URLs (Phase 1): one recipe, several
// places, guaranteed to drift the next time only one of them is edited. One
// component is what makes "match" hold rather than being a one-time sweep.
//
// Sizing — padding, type size, tracking — is deliberately *not* baked in here.
// It varies by call site (`px-6` to `px-10`, 9px to 10px type) in ways that
// would fight whatever a caller passes in `className`, and this project has no
// class-merge utility to resolve that safely. Colour, border, face and motion
// were the part actually duplicated eight times; size never was.

const VARIANTS = {
    // The filled button — every primary call to action on the site.
    solid: 'border border-ink bg-ink text-paper hover:border-statepurp hover:bg-statepurp disabled:cursor-not-allowed disabled:opacity-40',
    // The hairline button that inverts to `ink` on hover (`Orders`' refresh,
    // the grid's pagination and empty-state actions). The disabled treatment
    // is `Orders`' own — kept here rather than as one-off classes so a second
    // disabled outline button gets it for free.
    outline: 'border border-rule text-ink hover:border-ink hover:bg-ink hover:text-paper disabled:cursor-not-allowed disabled:border-rule disabled:text-ink-40 disabled:hover:bg-transparent',
    // The hairline button that only ever changes its border — About's and the
    // 404 page's secondary link, next to a `solid` primary one.
    quiet: 'border border-rule text-ink hover:border-ink disabled:cursor-not-allowed disabled:opacity-40',
}

/**
 * @param {object} props
 * @param {'solid'|'outline'|'quiet'} [props.variant]
 * @param {import('react').ElementType} [props.as]  E.g. `Link`, to cover the
 *   anchor call sites — `to` (or `href`) passes through in `...rest`.
 */
const Button = forwardRef(({ as: Component = 'button', variant = 'solid', type, className = '', children, ...rest }, ref) => {
    const isButtonElement = Component === 'button'
    return (
        <Component
            ref={ref}
            // A non-`<button>` (`Link`, `a`) has no `type` attribute to set —
            // passing one through would just be an unknown DOM attribute.
            {...(isButtonElement ? { type: type ?? 'button' } : {})}
            className={`font-michroma uppercase transition-colors duration-300 ${VARIANTS[variant]} ${className}`.trim()}
            {...rest}
        >
            {children}
        </Component>
    )
})

Button.displayName = 'Button'

Button.propTypes = {
    as: PropTypes.elementType,
    variant: PropTypes.oneOf(['solid', 'outline', 'quiet']),
    type: PropTypes.string,
    className: PropTypes.string,
    children: PropTypes.node,
}

export default Button
