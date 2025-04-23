import express from 'express';
import { placeOrder, allOrders, userOrders, updateStatus, placeGuestOrder } from '../controllers/orderController.js';
import adminAuth from '../middleware/adminAuth.js';
import authUser from '../middleware/auth.js';

const orderRouter = express.Router();

// Admin Features
orderRouter.post('/list',adminAuth, allOrders);
orderRouter.post('/status',adminAuth, updateStatus);

// Payment Features
orderRouter.post('/place',authUser, placeOrder);
// Guest checkout route - no auth required
orderRouter.post('/guest/place', placeGuestOrder);

// User Features
orderRouter.post('/userorders',authUser, userOrders);


export default orderRouter;

