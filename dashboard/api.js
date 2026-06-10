const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Product = require('../models/Product');
const Order   = require('../models/Order');
const User    = require('../models/User');

// ─── Auth middleware (simple secret key) ──────────────────────────────────────
router.use((req, res, next) => {
    const key = req.headers['x-admin-key'] || req.query.key;
    if (key !== process.env.ADMIN_DASHBOARD_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
});

// ─── STATS ────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
    try {
        const [
            totalOrders,
            totalRevenue,
            totalUsers,
            totalProducts,
            pendingOrders,
            paidOrders,
            shippingOrders,
            completedOrders,
            lowStockProducts,
            recentOrders,
            revenueByDay,
            topProducts
        ] = await Promise.all([
            Order.countDocuments(),
            Order.aggregate([{ $group: { _id: null, total: { $sum: '$totalPrice' } } }]),
            User.countDocuments(),
            Product.countDocuments(),
            Order.countDocuments({ status: 'pending_payment' }),
            Order.countDocuments({ status: 'pending' }),
            Order.countDocuments({ status: 'shipping' }),
            Order.countDocuments({ status: 'completed' }),
            Product.countDocuments({ stock: { $lte: 5 } }),
            Order.find().populate('user').sort({ createdAt: -1 }).limit(5),
            Order.aggregate([
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        revenue: { $sum: '$totalPrice' },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } },
                { $limit: 14 }
            ]),
            Order.aggregate([
                { $unwind: '$items' },
                {
                    $group: {
                        _id: '$items.product',
                        totalQty: { $sum: '$items.quantity' },
                        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
                    }
                },
                { $sort: { totalQty: -1 } },
                { $limit: 5 },
                { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
                { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } }
            ])
        ]);

        res.json({
            totalOrders,
            totalRevenue: totalRevenue[0]?.total || 0,
            totalUsers,
            totalProducts,
            ordersByStatus: { pending_payment: pendingOrders, pending: paidOrders, shipping: shippingOrders, completed: completedOrders },
            lowStockProducts,
            recentOrders: recentOrders.map(o => ({
                _id: o._id,
                orderId: o.orderId,
                user: o.user ? `${o.user.firstName || ''} ${o.user.lastName || ''}`.trim() || o.user.username || 'N/A' : 'N/A',
                totalPrice: o.totalPrice,
                status: o.status,
                paymentStatus: o.paymentStatus,
                createdAt: o.createdAt
            })),
            revenueByDay,
            topProducts: topProducts.map(t => ({
                name: t.product?.name || 'Unknown',
                totalQty: t.totalQty,
                totalRevenue: t.totalRevenue
            }))
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// ─── ORDERS ───────────────────────────────────────────────────────────────────
router.get('/orders', async (req, res) => {
    try {
        const { status, page = 1, limit = 20, search } = req.query;
        const query = {};
        if (status && status !== 'all') query.status = status;
        if (search) query.orderId = { $regex: search, $options: 'i' };

        const [orders, total] = await Promise.all([
            Order.find(query)
                .populate('user')
                .populate('items.product')
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(Number(limit)),
            Order.countDocuments(query)
        ]);

        res.json({
            orders: orders.map(o => ({
                _id: o._id,
                orderId: o.orderId || o._id,
                user: o.user ? {
                    name: `${o.user.firstName || ''} ${o.user.lastName || ''}`.trim() || o.user.username || 'N/A',
                    username: o.user.username,
                    telegramId: o.user.telegramId
                } : { name: 'N/A' },
                phone: o.phone,
                address: o.address,
                items: o.items.map(i => ({
                    name: i.product?.name || 'Deleted Product',
                    quantity: i.quantity,
                    price: i.price,
                    image: i.product?.image || null
                })),
                totalPrice: o.totalPrice,
                status: o.status,
                paymentStatus: o.paymentStatus || 'pending',
                paymentHash: o.paymentHash,
                createdAt: o.createdAt
            })),
            total,
            page: Number(page),
            pages: Math.ceil(total / limit)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/orders/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const allowed = ['pending_payment', 'pending', 'shipping', 'completed'];
        if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status' });

        const order = await Order.findById(req.params.id).populate('user');
        if (!order) return res.status(404).json({ error: 'Not found' });

        const prevStatus = order.status;
        order.status = status;

        if (status === 'pending' || status === 'shipping' || status === 'completed') {
            order.paymentStatus = 'paid';
        } else if (status === 'pending_payment') {
            order.paymentStatus = 'pending';
        }

        await order.save();

        // Send Telegram notification on successful payment confirmation
        if ((status === 'pending' || status === 'shipping' || status === 'completed') && prevStatus === 'pending_payment') {
            if (order.user && order.user.telegramId && req.bot && req.translations && req.getMainMenu) {
                const lang = order.user.language || 'en';
                const t = req.translations[lang] || req.translations.en;
                try {
                    await req.bot.telegram.sendMessage(
                        order.user.telegramId,
                        t.payment_success.replace('{orderId}', order.orderId),
                        { parse_mode: 'Markdown', ...req.getMainMenu(lang) }
                    );
                } catch (telegramErr) {
                    console.error('Failed to send Telegram success notification:', telegramErr);
                }
            }
        }

        res.json({ success: true, order });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/orders/:id/check-payment', async (req, res) => {
    try {
        const order = await Order.findById(req.params.id).populate('user');
        if (!order) return res.status(404).json({ error: 'Order not found' });

        if (order.status !== 'pending_payment') {
            return res.status(400).json({ error: 'Order is not pending payment' });
        }

        const checkBakongTransaction = async (paymentHash) => {
            const axios = require('axios');
            const token = process.env.BAKONG_TOKEN;
            const urls = [
                process.env.BAKONG_PROD_BASE_API_URL || 'https://api-bakong.nbc.gov.kh/v1',
                process.env.BAKONG_DEV_BASE_API_URL || 'https://sit-api-bakong.nbc.gov.kh/v1'
            ];

            let lastError = null;
            let any404 = false;

            for (const baseUrl of urls) {
                try {
                    const url = `${baseUrl}/check_transaction_by_md5`;
                    const response = await axios.post(url, { md5: paymentHash }, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 5000
                    });
                    const hasSuccessStatus = response.data && (
                        (response.data.status && response.data.status.code === 0) ||
                        (response.data.responseCode === 0 || response.data.responseCode === '0' || response.data.responseCode === 0)
                    );
                    if (hasSuccessStatus && response.data.data) {
                        return { success: true, data: response.data.data };
                    } else {
                        any404 = true;
                    }
                } catch (err) {
                    console.error(`Error checking Bakong API at ${baseUrl}:`, err.response ? err.response.status : err.message);
                    lastError = err;
                    if (err.response && err.response.status === 404) {
                        any404 = true;
                    }
                }
            }

            if (any404) {
                return { success: false, data: null };
            }

            if (lastError) {
                throw lastError;
            }
            return { success: false, data: null };
        };

        let checkResult;
        try {
            checkResult = await checkBakongTransaction(order.paymentHash);
        } catch (axiosErr) {
            console.error('Bakong API request failed:', axiosErr.message);
            const status = axiosErr.response ? axiosErr.response.status : null;
            let msg = 'Transaction not found or Bakong API is temporarily unavailable.';
            if (status === 404) {
                msg = 'Transaction not found in Bakong system. The customer might not have paid yet.';
            } else if (status === 502 || status === 503) {
                msg = 'Bakong Gateway/API is temporarily unavailable (502/503).';
            } else if (axiosErr.response && axiosErr.response.data && axiosErr.response.data.message) {
                msg = axiosErr.response.data.message;
            }
            return res.json({ success: true, paid: false, message: msg });
        }

        if (checkResult.success && checkResult.data) {
            const updatedOrder = await Order.findOneAndUpdate(
                { _id: req.params.id, status: 'pending_payment' },
                { 
                    status: 'pending', 
                    paymentStatus: 'paid',
                    paymentDetails: checkResult.data,
                    paidAt: new Date()
                },
                { new: true }
            );

            if (updatedOrder) {
                // Send Telegram notification on successful payment confirmation
                if (order.user && order.user.telegramId && req.bot && req.translations && req.getMainMenu) {
                    const lang = order.user.language || 'en';
                    const successMsg = lang === 'km'
                        ? `✅ ការទូទាត់ទទួលបានជោគជ័យ។ ការបញ្ជាទិញរបស់អ្នកត្រូវបានបញ្ជាក់។\n\n` +
                          `🧾 *ព័ត៌មានលម្អិតការទូទាត់:*\n` +
                          `- *លេខសំគាល់ការបញ្ជាទិញ:* \`${updatedOrder.orderId}\`\n` +
                          `- *ចំនួនទឹកប្រាក់:* \`$${updatedOrder.totalPrice.toFixed(2)}\`\n` +
                          `- *ស្ថានភាពទូទាត់:* \`Paid\``
                        : `✅ Payment received successfully. Your order has been confirmed.\n\n` +
                          `🧾 *Payment Details:*\n` +
                          `- *Order ID:* \`${updatedOrder.orderId}\`\n` +
                          `- *Amount:* \`$${updatedOrder.totalPrice.toFixed(2)}\`\n` +
                          `- *Payment Status:* \`Paid\``;

                    try {
                        await req.bot.telegram.sendMessage(
                            order.user.telegramId,
                            successMsg,
                            { parse_mode: 'Markdown', ...req.getMainMenu(lang) }
                        );
                    } catch (telegramErr) {
                        console.error('Failed to send Telegram success notification:', telegramErr);
                    }
                }
                return res.json({ success: true, paid: true, order: updatedOrder });
            }
        }

        return res.json({ success: true, paid: false, message: 'Transaction not found or still pending in Bakong system' });
    } catch (err) {
        console.error('Error in /orders/:id/check-payment:', err.message);
        res.status(500).json({ error: err.message });
    }
});

router.delete('/orders/:id', async (req, res) => {
    try {
        await Order.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
router.get('/products', async (req, res) => {
    try {
        const { search, category, page = 1, limit = 20 } = req.query;
        const query = {};
        if (search) query.name = { $regex: search, $options: 'i' };
        if (category && category !== 'all') query.category = category;

        const [products, total] = await Promise.all([
            Product.find(query).sort({ name: 1 }).skip((page - 1) * limit).limit(Number(limit)),
            Product.countDocuments(query)
        ]);
        const categories = await Product.distinct('category');
        res.json({ products, total, categories, page: Number(page), pages: Math.ceil(total / limit) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/products', async (req, res) => {
    try {
        const { name, description, price, category, stock, image } = req.body;
        const product = new Product({ name, description, price, category, stock, image });
        await product.save();
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/products/:id', async (req, res) => {
    try {
        const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!product) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, product });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/products/:id', async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── USERS ────────────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query;
        const query = {};
        if (search) {
            query.$or = [
                { firstName: { $regex: search, $options: 'i' } },
                { lastName: { $regex: search, $options: 'i' } },
                { username: { $regex: search, $options: 'i' } }
            ];
        }
        const [users, total] = await Promise.all([
            User.find(query).sort({ _id: -1 }).skip((page - 1) * limit).limit(Number(limit)),
            User.countDocuments(query)
        ]);

        // Attach order count per user
        const userIds = users.map(u => u._id);
        const orderCounts = await Order.aggregate([
            { $match: { user: { $in: userIds } } },
            { $group: { _id: '$user', count: { $sum: 1 }, total: { $sum: '$totalPrice' } } }
        ]);
        const orderMap = {};
        orderCounts.forEach(oc => { orderMap[oc._id.toString()] = oc; });

        res.json({
            users: users.map(u => ({
                _id: u._id,
                telegramId: u.telegramId,
                name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.username || 'N/A',
                username: u.username,
                phone: u.phone,
                address: u.address,
                isAdmin: u.isAdmin,
                orderCount: orderMap[u._id.toString()]?.count || 0,
                totalSpent: orderMap[u._id.toString()]?.total || 0
            })),
            total,
            page: Number(page),
            pages: Math.ceil(total / limit)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/users/:id/admin', async (req, res) => {
    try {
        const { isAdmin } = req.body;
        const user = await User.findByIdAndUpdate(req.params.id, { isAdmin }, { new: true });
        if (!user) return res.status(404).json({ error: 'Not found' });
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
