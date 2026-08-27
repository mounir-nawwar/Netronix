import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import PropTypes from 'prop-types'
import { FiShoppingBag, FiHeart, FiLogOut } from 'react-icons/fi'

// The signed-in account panel, lifted out of `Navbar.jsx` where it existed
// **twice** — once for the desktop bar, once for the mobile icon row —
// byte-identical apart from `w-64`/`w-56` and `rounded-xl`/`rounded-lg`. Same
// defect shape as the four product cards (FE-007) and the eight-times-typed
// button (`components/Button.jsx`): one recipe, drawn twice, guaranteed to
// drift the next time only one copy is touched.
//
// It sat on zero design-system tokens: `bg-white`, `border-gray-100`,
// `rounded-xl`, `shadow-xl`, `text-gray-700` throughout, including a header
// strip on `bg-gray-50` — the blue-tinted grey `tailwind.config.js` names as
// the specific wrong choice `paper`/`wash` exist to replace. Square now,
// `bg-plate`, a hairline `border-rule`, and the eyebrow idiom on the header
// (`font-michroma … text-ink-40` on `wash`) that every other labelled section
// on the site already uses.
//
// Sign Out keeps a real red rather than being pulled onto the neutral palette
// — "something destructive" is the one state this project's restrained accent
// should not flatten to `ink`. It is the same `red-500` the restyled toast
// error bar uses (`index.css`), so there is exactly one red on the site.
const AccountMenu = forwardRef(({ id, variants, widthClassName = 'w-64', onNavigate, onLogout }, ref) => (
    <motion.div
        ref={ref}
        id={id}
        className={`absolute right-0 z-50 mt-2 overflow-hidden border border-rule bg-plate shadow-[0_2px_8px_rgba(18,18,20,0.06)] ${widthClassName}`}
        variants={variants}
        initial="hidden"
        animate="visible"
        exit="exit"
    >
        <div className="border-b border-rule bg-wash px-4 py-3">
            <p className="font-michroma text-[9px] uppercase tracking-[0.16em] text-ink-40">Account</p>
        </div>

        <div className="py-1">
            <Link
                to="/orders"
                className="flex items-center gap-3 px-4 py-3 text-sm text-ink transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-statepurp"
                onClick={onNavigate}
            >
                <FiShoppingBag className="h-4 w-4 text-ink-40" aria-hidden="true" />
                <span>My Orders</span>
            </Link>

            <Link
                to="/wishlist"
                className="flex items-center gap-3 px-4 py-3 text-sm text-ink transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-statepurp"
                onClick={onNavigate}
            >
                <FiHeart className="h-4 w-4 text-ink-40" aria-hidden="true" />
                <span>My Wishlist</span>
            </Link>
        </div>

        <div className="border-t border-rule py-1">
            <button
                type="button"
                className="flex w-full items-center gap-3 px-4 py-3 text-sm text-red-500 transition-colors hover:bg-wash focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-statepurp"
                onClick={onLogout}
            >
                <FiLogOut className="h-4 w-4" aria-hidden="true" />
                <span>Sign Out</span>
            </button>
        </div>
    </motion.div>
))

AccountMenu.displayName = 'AccountMenu'

AccountMenu.propTypes = {
    /** Only the desktop panel needs one — it is what the trigger's `aria-controls` names. */
    id: PropTypes.string,
    variants: PropTypes.object.isRequired,
    widthClassName: PropTypes.string,
    onNavigate: PropTypes.func.isRequired,
    onLogout: PropTypes.func.isRequired,
}

export default AccountMenu
