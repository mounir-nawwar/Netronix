import { useContext } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { ShopContext } from '../context/shopContext'
import PropTypes from 'prop-types';

/**
 * A route only a signed-in customer may see (FE-021).
 *
 * `/orders` was public. `Orders.jsx` had `if (!token) return null` *inside* a
 * `try`, with `finally` clearing the loading flag — so a logged-out visitor saw
 * "No orders found", which is a statement about their account rather than about
 * their session, and it is false.
 *
 * The redirect remembers where it came from, so signing in returns the customer
 * to the page they asked for rather than to the homepage.
 *
 * **Guest checkout stays public.** `/placeorder` is deliberately not behind
 * this: buying without an account is a supported path, and gating it would
 * remove a feature under the guise of fixing a bug.
 */
const RequireAuth = ({ children }) => {
    const { token } = useContext(ShopContext)
    const location = useLocation()

    // A session restored from storage arrives on the second render, so the token
    // in storage counts as signed-in for the purposes of this gate. Whether it
    // is *valid* is the server's answer to give, on the request the page makes.
    let storedToken = ''
    try {
        storedToken = localStorage.getItem('token') || ''
    } catch {
        // Storage can be unavailable in hardened/private browser contexts. A
        // route guard must fail closed rather than crash the routed tree.
    }
    const signedIn = Boolean(token || storedToken)

    if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname }} />

    return children
}

RequireAuth.propTypes = {
    children: PropTypes.node,
};

export default RequireAuth
