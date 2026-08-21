import orderModel from '../models/orderModel.js';
import productModel from '../models/productModel.js';
import { createOrder } from '../services/orderService.js';
import { applyStatusTransition, assertTransition } from '../services/orderStatus.js';
import { idempotencyScope, readIdempotencyKey } from '../services/idempotency.js';
import { paginated, resolvePaging } from '../lib/pagination.js';
import { labelFor } from '../lib/variant.js';
import { readMinor, toMajor, DEFAULT_CURRENCY } from '../lib/money.js';
import { asyncHandler, ConflictError, NotFoundError } from '../errors/AppError.js';

// Both placement controllers are wrappers over one service (BE-007). Note what
// neither of them reads: `amount`, `subtotal`, `delivery_fee`. The schema still
// accepts those from an older cached bundle, and `req.validated.body` still
// contains them, but nothing below consults them.

/** Everything the two placement routes have in common. */
async function place(req, res, userId) {
    const { items, address, paymentMethod } = req.validated.body;

    // DB-012. Absent is legal — the deployed storefront does not send one —
    // but a key that *is* sent must be well-formed, and its replay behaviour is
    // then guaranteed.
    const key = readIdempotencyKey(req);
    const scope = idempotencyScope({ userId, req });

    const { order, replayed } = await createOrder({
        userId,
        items,
        address,
        paymentMethod,
        idempotency: { key, scope },
    });

    // A replay answers with the semantics the original request had, so a client
    // that retried cannot tell the difference — which is the point. `replayed`
    // is additive and says which it was.
    res.status(201).json({
        success: true,
        message: 'Order Placed Successfully',
        order,
        replayed,
    });
}

// Guest order placement
const placeGuestOrder = asyncHandler(async (req, res) => {
    await place(req, res, null);
});

// Placing orders using COD Method
const placeOrder = asyncHandler(async (req, res) => {
    // From the verified token, never from the body.
    await place(req, res, req.auth.userId);
});

/**
 * Present an order for a client.
 *
 * **Snapshot first (DB-005, BE-002).** A line written in Phase 2 carries its own
 * name, price, image and variant identity, so nothing is looked up: listing N
 * orders is one query for the orders and one for the count, whatever N is. The
 * old code issued a `findById` **per line** and merged today's catalog into the
 * response, which is both the N+1 (BE-002) and the reason history changed when a
 * price did (DB-005).
 *
 * The catalog fallback below runs only for a line with no snapshot — an order
 * placed before the migration on a database where it has not been run. It is the
 * dual-read half of the rollout and is deliberately narrow: `productIds` is
 * empty for snapshot orders, so no second query is issued at all.
 */
async function presentOrders(orders, { extraFields = {} } = {}) {
    const plain = orders.map((order) => (typeof order.toObject === 'function' ? order.toObject() : order));

    // Only lines that predate the snapshot need the catalog.
    const legacyProductIds = new Set();
    for (const order of plain) {
        for (const item of order.items ?? []) {
            if (item?.name === undefined && item?.productId) legacyProductIds.add(String(item.productId));
        }
    }

    let catalog = new Map();
    if (legacyProductIds.size > 0) {
        // One query for all of them, not one per line: even the compatibility
        // path is not an N+1.
        const products = await productModel.find({ _id: { $in: [...legacyProductIds] } }).lean();
        catalog = new Map(products.map((product) => [String(product._id), product]));
    }

    return plain.map((order) => ({
        ...order,
        currency: order.currency ?? DEFAULT_CURRENCY,
        amountMinor: readMinor(order, 'amountMinor', 'amount'),
        subtotalMinor: readMinor(order, 'subtotalMinor', 'subtotal'),
        deliveryFeeMinor: readMinor(order, 'deliveryFeeMinor', 'delivery_fee'),
        items: (order.items ?? []).map((item) => {
            if (item?.name !== undefined) {
                // A real snapshot. Nothing is resolved.
                const unitPriceMinor = readMinor(item, 'unitPriceMinor', 'unitPrice');
                return {
                    ...item,
                    // `price` is the pre-Phase-2 field name both clients read.
                    price: item.unitPrice ?? (unitPriceMinor === null ? 0 : toMajor(unitPriceMinor)),
                    unitPriceMinor,
                    lineTotalMinor: readMinor(item, 'lineTotalMinor', 'lineTotal'),
                    currency: item.currency ?? order.currency ?? DEFAULT_CURRENCY,
                };
            }

            // Compatibility path for a pre-snapshot line.
            const product = catalog.get(String(item?.productId));
            if (!product) return item;
            const unitPriceMinor = readMinor(product, 'priceMinor', 'price');
            return {
                ...item,
                name: product.name,
                price: product.price,
                unitPrice: product.price,
                unitPriceMinor,
                lineTotalMinor: unitPriceMinor === null ? null : unitPriceMinor * Number(item.quantity ?? 1),
                image: Array.isArray(product.image) ? product.image[0] : product.image,
                variantLabel: labelFor(product, { variantKey: item.size ?? item.variantKey }),
                currency: product.currency ?? DEFAULT_CURRENCY,
                // Not captured at purchase. Reconstructed from today's catalog,
                // and said so, exactly as the migration's own backfill does.
                _reconstructed: true,
                ...Object.fromEntries(
                    Object.entries(extraFields).map(([key, source]) => [key, product[source]]),
                ),
            };
        }),
    }));
}

//All Orders data for Admin
const allOrders = asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePaging(req.validated.query);

    // Deterministic sort, or "page 2" means nothing (BE-009).
    const [orders, total] = await Promise.all([
        orderModel.find({}).sort({ date: -1, _id: -1 }).skip(skip).limit(limit),
        orderModel.countDocuments({}),
    ]);

    res.json(paginated('orders', await presentOrders(orders, { extraFields: { brand: 'brand' } }), { total, page, limit }));
});

// User Order Data for Frontend
const userOrders = asyncHandler(async (req, res) => {
    const { page, limit, skip } = resolvePaging(req.validated.query);
    const filter = { userId: req.auth.userId };

    const [orders, total] = await Promise.all([
        orderModel.find(filter).sort({ date: -1, _id: -1 }).skip(skip).limit(limit),
        orderModel.countDocuments(filter),
    ]);

    res.json(paginated('orders', await presentOrders(orders), { total, page, limit }));
});

// Update Order Status from Admin Panel
const updateStatus = asyncHandler(async (req, res) => {
    const { orderId, status } = req.validated.body;

    const order = await orderModel.findById(orderId).lean();
    if (!order) throw new NotFoundError('Order not found');

    // DB-008. Throws a 409 and leaves the order exactly as it is when the
    // transition is not one the fulfilment sequence allows.
    assertTransition(order.status, status);

    // The status that was just read is the guard, so the check above and the
    // write below are one operation. Read-modify-`save()` let two
    // administrators transition from the same stale state, and the second
    // overwrote both the first's status and the history entry it appended.
    // It also validated the whole document, which no pre-Phase-2 order can
    // satisfy — see `applyStatusTransition`.
    const { matched } = await applyStatusTransition({
        orderId: order._id,
        from: order.status,
        to: status,
        by: `admin:${req.auth.userId}`,
    });

    if (!matched) {
        const current = await orderModel.findById(orderId).lean();
        if (!current) throw new NotFoundError('Order not found');
        throw new ConflictError(
            `This order is now "${current.status}" and can no longer be moved to "${status}"`,
            { details: `expected ${order.status}, found ${current.status}` },
        );
    }

    res.json({
        success: true,
        message: 'Order Status Updated Successfully',
        order: await orderModel.findById(orderId).lean(),
    });
});

export { placeOrder, allOrders, userOrders, updateStatus, placeGuestOrder, presentOrders };
