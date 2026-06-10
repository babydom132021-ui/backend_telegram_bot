const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
});

const orderSchema = new mongoose.Schema({
    orderId: { type: String, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [orderItemSchema],
    totalPrice: { type: Number, required: true },
    status: { type: String, enum: ['pending_payment', 'pending', 'shipping', 'completed', 'cancelled'], default: 'pending_payment' },
    phone: String,
    address: String,
    paymentStatus: { type: String, default: 'pending' },
    paymentHash: String,
    paymentDetails: mongoose.Schema.Types.Mixed,
    paidAt: Date,
    createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Order', orderSchema);
