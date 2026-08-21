// Orders (FE-006).

import { post, normalisePage } from './client'
import { IDEMPOTENCY_HEADER } from '../lib/idempotency'

/**
 * Place an order.
 *
 * SEC-002 — no pricing figure is sent. The server resolves every unit price
 * from the database and applies the delivery fee itself; sending numbers it will
 * ignore would only imply they still matter.
 *
 * DB-012 — `idempotencyKey` identifies the *attempt*, not the request. The
 * server has honoured it since Phase 2; sending it is what turns a retry after
 * a timeout into the same order rather than a second one. It is optional here
 * only so a caller that has no attempt in hand still works.
 */
export async function placeOrder({ items, address, paymentMethod, authenticated, idempotencyKey }) {
    const path = authenticated ? '/api/order/place' : '/api/order/guest/place'
    const config = idempotencyKey ? { headers: { [IDEMPOTENCY_HEADER]: idempotencyKey } } : undefined
    return post(path, { items, address, paymentMethod }, config)
}

export async function listMyOrders(params) {
    const data = await post('/api/order/userorders', {}, { params })
    return normalisePage(data, 'orders')
}
