import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    orderNumber: { type: Number, required: true, default: 1000 },
    items: { type: Array, required: true },
    amount: { type: Number, required: true },
    address: { type: Object, required: true },
    status: { type: String, required: true, default: 'Order Placed' },
    paymentMethod: { type: String, required: true },
    payment: { type: Boolean, required: true, default: false },
    date: { type: Date, required: true, default: Date.now },
    subtotal: { type: Number, default: 0 },
    delivery_fee: { type: Number, default: 0 }
});

const orderModel = mongoose.models.Order || mongoose.model('order', orderSchema);

export default orderModel;

