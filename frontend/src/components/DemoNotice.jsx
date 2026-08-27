import PropTypes from 'prop-types'

/**
 * What this storefront is, said where it matters.
 *
 * Netronix is a portfolio build. Orders are written to a real database, given a
 * real order number and shown in a real order history — and then nothing
 * happens, because there is no warehouse, no courier and no payment processor
 * behind any of it. Until now the site never said so anywhere: the checkout
 * reported `Order placed successfully!` and left it there.
 *
 * Deliberately **not** site-wide. The catalog, the product pages and About are
 * a shop and should read as one; a banner on every page would be a disclaimer
 * about the work rather than information for the person using it. This appears
 * at the two moments where someone could otherwise form a false belief about
 * what is going to happen next: on the checkout, and on their order history.
 *
 * On the checkout it renders **above the button**, not after it. That ordering
 * is the whole point for a guest: `PlaceOrder` sends an unauthenticated
 * customer to `/` a second and a half after ordering, and `/orders` is behind
 * `RequireAuth` — so a guest never sees an order number, a total, or any record
 * at all. The checkout is the only place they will ever be told.
 *
 * It also does not promise a confirmation email, because there is no mail
 * library anywhere in the backend. That is not an unimplemented feature; it is
 * a thing the system cannot do.
 */
const DemoNotice = ({ className = '' }) => (
    <p className={`border-l-2 border-statepurp bg-wash px-4 py-3 text-xs leading-relaxed text-ink-60 ${className}`}>
        <span className="font-michroma text-[9px] uppercase tracking-[0.16em] text-ink">
            Demonstration build
        </span>
        <span className="mt-1.5 block">
            This is a portfolio project by MINN, not a trading shop. Placing an order
            records it here so the flow can be seen end to end — nothing is dispatched,
            no payment is taken, and no card details are ever collected.
        </span>
    </p>
)

DemoNotice.propTypes = {
    className: PropTypes.string,
}

export default DemoNotice
