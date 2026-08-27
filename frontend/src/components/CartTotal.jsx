import { useContext } from 'react'
import PropTypes from 'prop-types'

import { ShopContext } from '../context/shopContext'

/**
 * FE-018 / DB-004.
 *
 * This rendered `{currency} {getCartAmount()}.00`. `getCartAmount()` returned a
 * float, so a cart holding a $1,299.99 laptop displayed **$1299.99.00** — a
 * string built by concatenation, with no thousands separator and a decimal point
 * appended to a number that already had one.
 *
 * There is no way to build a correct money string by hand, and there is a
 * built-in that does it. Totals are now summed as integer minor units and
 * formatted once, at the edge, through `Intl.NumberFormat`.
 *
 * The heading used to be `<Title text1="CART" text2="TOTAL">` — the grey-word,
 * dark-word, little-rule treatment out of every React storefront tutorial. It is
 * the catalog's rule-flanked eyebrow now, which is what `CatalogMasthead` and
 * the product page's specification sheet already use.
 */
const CartTotal = ({ heading = 'Cart total' }) => {
    const { getCartAmountMinor, deliveryFeeMinor, formatPrice } = useContext(ShopContext)

    const subtotalMinor = getCartAmountMinor()
    // An empty cart is free to deliver: the fee is applied to an order, and
    // there is no order. This preserves the previous behaviour, which special-
    // cased a zero subtotal in the total line.
    const shippingMinor = subtotalMinor === 0 ? 0 : deliveryFeeMinor
    const totalMinor = subtotalMinor + shippingMinor

    return (
        <div className="w-full">
            <div className="flex items-center gap-3">
                <h2 className="font-michroma text-[10px] uppercase tracking-[0.2em] text-ink">{heading}</h2>
                <span className="h-px flex-1 bg-rule" />
            </div>

            {/* A description list, because that is what this is: three labelled
                figures. It was three `<div>`s of `<p>`s separated by `<hr>`. */}
            <dl className="mt-6 text-sm">
                <div className="flex items-baseline justify-between py-2">
                    <dt className="text-ink-60">Subtotal</dt>
                    <dd className="tnum text-ink">{formatPrice(subtotalMinor)}</dd>
                </div>

                <div className="flex items-baseline justify-between border-t border-rule py-2">
                    <dt className="text-ink-60">Shipping Fee</dt>
                    <dd className="tnum text-ink">{formatPrice(shippingMinor)}</dd>
                </div>

                <div className="mt-1 flex items-baseline justify-between border-t border-ink pt-4">
                    <dt className="font-michroma text-[10px] uppercase tracking-[0.16em] text-ink">Total</dt>
                    <dd className="tnum text-lg text-ink">{formatPrice(totalMinor)}</dd>
                </div>
            </dl>
        </div>
    )
}

CartTotal.propTypes = {
    /** Named, because the checkout calls the same figures "Order summary". */
    heading: PropTypes.string,
}

export default CartTotal
