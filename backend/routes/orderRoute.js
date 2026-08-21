import express from 'express';
import { placeOrder, allOrders, userOrders, updateStatus, placeGuestOrder } from '../controllers/orderController.js';
import adminAuth from '../middleware/adminAuth.js';
import authUser from '../middleware/auth.js';
import { guestOrderLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import {
    placeOrderSchema,
    placeGuestOrderSchema,
    updateStatusSchema,
    listOrdersSchema,
} from '../validators/order.js';

const orderRouter = express.Router();

// Admin Features
orderRouter.post('/list', adminAuth, validate(listOrdersSchema), allOrders);
orderRouter.post('/status', adminAuth, validate(updateStatusSchema), updateStatus);

// Payment Features
orderRouter.post('/place', authUser, validate(placeOrderSchema), placeOrder);
// Guest checkout route - no auth required.
// Unauthenticated and inventory-mutating, so it is throttled hardest of all
// (SEC-011): 3 per hour per IP.
orderRouter.post('/guest/place', guestOrderLimiter, validate(placeGuestOrderSchema), placeGuestOrder);

// User Features
orderRouter.post('/userorders', authUser, validate(listOrdersSchema), userOrders);


export default orderRouter;
