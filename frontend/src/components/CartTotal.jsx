import { useContext } from 'react'
import { ShopContext } from '../context/shopContext'
import Title from './Title';

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
 */
const CartTotal = () => {

    const { getCartAmountMinor, deliveryFeeMinor, formatPrice } = useContext(ShopContext);

    const subtotalMinor = getCartAmountMinor();
    // An empty cart is free to deliver: the fee is applied to an order, and
    // there is no order. This preserves the previous behaviour, which special-
    // cased a zero subtotal in the total line.
    const shippingMinor = subtotalMinor === 0 ? 0 : deliveryFeeMinor;
    const totalMinor = subtotalMinor + shippingMinor;

  return (
    <div className='w-full'>
        <div className='text-2xl'>
            <Title text1={'CART'} text2={'TOTAL'}/>
        </div>

        <div className='flex flex-col gap-2 mt-2 text-sm'>
            <div className='flex justify-between'>
                <p>Subtotal</p>
                <p>{formatPrice(subtotalMinor)}</p>
            </div>
            <hr/>
            <div className='flex justify-between'>
                <p>Shipping Fee</p>
                <p>{formatPrice(shippingMinor)}</p>
            </div>
            <hr />
            <div className='flex justify-between'>
                <b>Total</b>
                <b>{formatPrice(totalMinor)}</b>
            </div>
        </div>
    </div>
  )
}

export default CartTotal
