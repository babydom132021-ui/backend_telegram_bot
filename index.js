require('dotenv').config();
const dns = require('dns');
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}
dns.setServers(['8.8.8.8', '1.1.1.1']);

const { Telegraf, session, Markup } = require('telegraf');
const mongoose = require('mongoose');

const User = require('./models/User');
const Product = require('./models/Product');
const Cart = require('./models/Cart');
const Order = require('./models/Order');
const { generateReceipt } = require('./utils/receiptGenerator');

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MongoDB connected');
        await seedProducts();
    })
    .catch(err => console.error(err));

async function seedProducts() {
    try {
        const count = await Product.countDocuments();
        if (count === 0) {
            const sampleProducts = [
                {
                    name: 'iPhone 15 Pro',
                    description: 'Latest Apple iPhone with Titanium design.',
                    price: 999,
                    category: 'Electronics',
                    stock: 10,
                    image: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&q=80&w=800'
                },
                {
                    name: 'Wireless Headphones',
                    description: 'Noise cancelling over-ear headphones.',
                    price: 199,
                    category: 'Electronics',
                    stock: 15,
                    image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&q=80&w=800'
                },
                {
                    name: 'Classic Leather Jacket',
                    description: 'Genuine leather jacket in black.',
                    price: 149,
                    category: 'Clothing',
                    stock: 5,
                    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&q=80&w=800'
                },
                {
                    name: 'Running Shoes',
                    description: 'Comfortable sports shoes for daily jogging.',
                    price: 89,
                    category: 'Clothing',
                    stock: 20,
                    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=800'
                }
            ];
            await Product.insertMany(sampleProducts);
            console.log('Database seeded with sample products.');
        }
    } catch (error) {
        console.error('Failed to seed products:', error);
    }
}

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.use(session());

// Logging Middleware
bot.use(async (ctx, next) => {
    console.log(`Update: ${ctx.updateType} | Data: ${ctx.callbackQuery ? ctx.callbackQuery.data : ctx.message ? ctx.message.text : 'N/A'}`);
    try {
        await next();
    } catch (err) {
        console.error('Error in middleware chain:', err);
    }
});

// Helper function to get or create user
async function getUser(ctx) {
    const tgUser = ctx.from;
    let user = await User.findOne({ telegramId: tgUser.id });
    if (!user) {
        user = new User({
            telegramId: tgUser.id,
            firstName: tgUser.first_name,
            lastName: tgUser.last_name,
            username: tgUser.username,
            isAdmin: false
        });
        await user.save();
    }
    return user;
}

// Main Menu
const mainMenu = Markup.keyboard([
    ['🛍️ Shop Products', '🔎 Search'],
    ['🛒 My Cart', '📦 My Orders']
]).resize();

bot.start(async (ctx) => {
    await getUser(ctx);
    ctx.session = ctx.session || {};
    ctx.session.state = null;
    await ctx.reply('Welcome to our E-commerce Store! 🏪\nPlease choose an option below:\n(P.S. Send /adminsecret to become an admin for testing)', mainMenu);
});

bot.command('adminsecret', async (ctx) => {
    const user = await getUser(ctx);
    user.isAdmin = true;
    await user.save();
    return ctx.reply('You are now an Admin! ⚙️ Click "⚙️ Admin Panel" from the main menu.');
});

// --- SHOP PRODUCTS & CATEGORIES ---
// --- SHOP PRODUCTS & CATEGORIES ---
bot.hears('🛍️ Shop Products', async (ctx) => {
    const categories = await Product.distinct('category');
    if (categories.length === 0) {
        return ctx.reply('No products available at the moment.');
    }
    const buttons = categories.map(cat => [Markup.button.callback(cat, `cat_${cat}`)]);
    await ctx.reply('Select a category:', Markup.inlineKeyboard(buttons));
});

bot.action(/cat_(.+)/, async (ctx) => {
    const category = ctx.match[1];
    // Prevent matching 'manage' or other admin callbacks
    if (category.startsWith('manage') || category.startsWith('view_order')) return;

    const products = await Product.find({ category });
    if (products.length === 0) {
        return ctx.reply('No products in this category.');
    }

    await ctx.reply(`Showing products in *${category}*:`, { parse_mode: 'Markdown' });

    for (const p of products) {
        const message = `🛍️ *${p.name}*\n💰 Price: $${p.price}`;
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('Add to Cart 🛒', `add_${p._id}`),
                Markup.button.callback('View Details ℹ️', `prod_${p._id}`)
            ]
        ]);

        if (p.image) {
            try {
                await ctx.replyWithPhoto(p.image, {
                    caption: message,
                    parse_mode: 'Markdown',
                    ...keyboard
                });
            } catch (err) {
                await ctx.replyWithMarkdown(message + '\n\n⚠️ (Image failed to load)', keyboard);
            }
        } else {
            await ctx.replyWithMarkdown(message, keyboard);
        }
    }
    await ctx.answerCbQuery();
});

bot.action(/prod_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    // Prevent matching 'manage' or other admin callbacks
    if (productId.startsWith('manage') || productId.startsWith('view_order')) return;

    const product = await Product.findById(productId);
    if (!product) return ctx.reply('Product not found.');

    const message = `📦 *${product.name}*\n\n📝 ${product.description || 'No description'}\n\n💰 Price: $${product.price}\n📊 Stock: ${product.stock > 0 ? product.stock : 'Out of stock'}`;
    
    const buttons = [];
    if (product.stock > 0) {
        buttons.push([Markup.button.callback('Add to Cart 🛒', `add_${product._id}`)]);
    }
    buttons.push([Markup.button.callback('⬅️ Back to Categories', 'back_cats')]);

    const keyboard = Markup.inlineKeyboard(buttons);

    if (product.image) {
        try {
            await ctx.replyWithPhoto(product.image, {
                caption: message,
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (err) {
            await ctx.replyWithMarkdown(message + '\n\n⚠️ (Image failed to load)', keyboard);
        }
    } else {
        await ctx.replyWithMarkdown(message, keyboard);
    }
    await ctx.answerCbQuery();
});

bot.action('back_cats', async (ctx) => {
    const categories = await Product.distinct('category');
    const buttons = categories.map(cat => [Markup.button.callback(cat, `cat_${cat}`)]);
    await ctx.reply('Select a category:', Markup.inlineKeyboard(buttons));
    await ctx.answerCbQuery();
});

// --- CART SYSTEM HELPERS & HANDLERS ---
async function viewCart(ctx) {
    const user = await getUser(ctx);
    const cart = await Cart.findOne({ user: user._id }).populate('items.product');

    if (!cart || cart.items.length === 0) {
        const emptyMsg = 'Your cart is empty. 🛒';
        if (ctx.callbackQuery) {
            try {
                await ctx.editMessageText(emptyMsg);
            } catch (e) {
                await ctx.reply(emptyMsg);
            }
        } else {
            await ctx.reply(emptyMsg);
        }
        return;
    }

    let message = '*🛒 Your Cart:*\n\n';
    let total = 0;
    const buttons = [];

    cart.items.forEach((item) => {
        if (!item.product) return;
        const itemTotal = item.product.price * item.quantity;
        total += itemTotal;
        message += `📦 *${item.product.name}*\n   Price: $${item.product.price} | Qty: ${item.quantity}\n   Subtotal: $${itemTotal}\n\n`;
        
        buttons.push([
            Markup.button.callback(`➖`, `dec_${item.product._id}`),
            Markup.button.callback(`Qty: ${item.quantity}`, `noop`),
            Markup.button.callback(`➕`, `inc_${item.product._id}`),
            Markup.button.callback(`❌ Remove`, `rm_${item.product._id}`)
        ]);
    });

    message += `*Total Price: $${total}*`;
    
    if (total > 0) {
        buttons.push([
            Markup.button.callback('💳 Checkout', 'checkout'),
            Markup.button.callback('🗑️ Clear Cart', 'clear_cart')
        ]);
    }

    const keyboard = Markup.inlineKeyboard(buttons);

    if (ctx.callbackQuery) {
        try {
            await ctx.editMessageText(message, { parse_mode: 'Markdown', ...keyboard });
        } catch (e) {
            // Content same or edit error
        }
    } else {
        await ctx.replyWithMarkdown(message, keyboard);
    }
}

bot.action('noop', (ctx) => ctx.answerCbQuery());

bot.action(/add_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    // Prevent matching 'prod_manage' or similar admin callbacks
    if (productId.startsWith('manage') || productId.startsWith('view_order')) return;

    const user = await getUser(ctx);
    const product = await Product.findById(productId);
    
    if (!product || product.stock <= 0) {
        return ctx.answerCbQuery('Out of stock or not found.', { show_alert: true });
    }

    let cart = await Cart.findOne({ user: user._id });
    if (!cart) {
        cart = new Cart({ user: user._id, items: [] });
    }

    const itemIndex = cart.items.findIndex(item => item.product && item.product.toString() === productId);
    if (itemIndex > -1) {
        cart.items[itemIndex].quantity += 1;
    } else {
        cart.items.push({ product: productId, quantity: 1 });
    }

    await cart.save();
    await ctx.answerCbQuery(`${product.name} added to cart!`);
    await ctx.reply(`🛒 Added *${product.name}* to your cart!`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🛒 View Cart', 'show_cart')]
        ])
    });
});

bot.hears('🛒 My Cart', async (ctx) => {
    await viewCart(ctx);
});

bot.action(/rm_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const user = await getUser(ctx);
    const cart = await Cart.findOne({ user: user._id });

    if (cart) {
        cart.items = cart.items.filter(item => item.product && item.product.toString() !== productId);
        await cart.save();
        await ctx.answerCbQuery('Item removed.');
        await viewCart(ctx);
    }
});

bot.action(/dec_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const user = await getUser(ctx);
    const cart = await Cart.findOne({ user: user._id });
    if (!cart) return ctx.answerCbQuery('Cart is empty.');

    const itemIndex = cart.items.findIndex(item => item.product && item.product.toString() === productId);
    if (itemIndex > -1) {
        if (cart.items[itemIndex].quantity > 1) {
            cart.items[itemIndex].quantity -= 1;
            await cart.save();
            await ctx.answerCbQuery('Quantity decreased.');
        } else {
            cart.items = cart.items.filter(item => item.product && item.product.toString() !== productId);
            await cart.save();
            await ctx.answerCbQuery('Item removed from cart.');
        }
        await viewCart(ctx);
    } else {
        await ctx.answerCbQuery('Item not found in cart.');
    }
});

bot.action(/inc_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const user = await getUser(ctx);
    const product = await Product.findById(productId);
    if (!product) return ctx.answerCbQuery('Product not found.');

    const cart = await Cart.findOne({ user: user._id });
    if (!cart) return ctx.answerCbQuery('Cart is empty.');

    const itemIndex = cart.items.findIndex(item => item.product && item.product.toString() === productId);
    if (itemIndex > -1) {
        if (product.stock > cart.items[itemIndex].quantity) {
            cart.items[itemIndex].quantity += 1;
            await cart.save();
            await ctx.answerCbQuery('Quantity increased.');
        } else {
            await ctx.answerCbQuery(`Cannot add more. Only ${product.stock} items left in stock.`, { show_alert: true });
        }
        await viewCart(ctx);
    } else {
        await ctx.answerCbQuery('Item not found in cart.');
    }
});

bot.action('clear_cart', async (ctx) => {
    const user = await getUser(ctx);
    await Cart.findOneAndUpdate({ user: user._id }, { items: [] });
    await ctx.answerCbQuery('Cart cleared.', { show_alert: true });
    await viewCart(ctx);
});

bot.action('checkout', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.state = 'checkout_phone';
    await ctx.reply('📱 Please enter your phone number:', Markup.inlineKeyboard([
        [Markup.button.callback('⬅️ Back to Cart', 'show_cart')]
    ]));
    await ctx.answerCbQuery();
});

bot.action('show_cart', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.state = null;
    await viewCart(ctx);
    await ctx.answerCbQuery();
});

bot.action('pay_now', async (ctx) => {
    ctx.session = ctx.session || {};
    if (ctx.session.state !== 'checkout_confirm' || !ctx.session.checkoutData) {
        return ctx.reply('No active order confirmation found.', mainMenu);
    }

    const user = await getUser(ctx);
    const cart = await Cart.findOne({ user: user._id }).populate('items.product');
    if (!cart || cart.items.length === 0) {
        ctx.session.state = null;
        return ctx.reply('Your cart is empty. Cannot proceed.', mainMenu);
    }

    // Double check stock and deduct
    let total = 0;
    const orderItems = [];
    for (let item of cart.items) {
        if (item.product && item.product.stock >= item.quantity) {
            total += item.product.price * item.quantity;
            orderItems.push({
                product: item.product._id,
                quantity: item.quantity,
                price: item.product.price
            });
            item.product.stock -= item.quantity;
            await item.product.save();
        }
    }

    if (orderItems.length === 0) {
        ctx.session.state = null;
        ctx.session.checkoutData = null;
        return ctx.reply('All items in your cart are currently out of stock. Order cancelled.', mainMenu);
    }

    // Generate custom Order ID: ORD-2026-0001
    const today = new Date();
    const year = today.getFullYear();
    const count = await Order.countDocuments() + 1;
    const customOrderId = `ORD-${year}-${String(count).padStart(4, '0')}`;

    try {
        const { BakongKHQR, IndividualInfo, khqrData } = require('bakong-khqr');
        const QRCode = require('qrcode');

        const optionalData = {
            currency: khqrData.currency.usd,
            amount: total,
            billNumber: customOrderId,
            storeLabel: 'E-commerce Store',
            terminalLabel: 'Telegram Bot',
            expirationTimestamp: Date.now() + (10 * 60 * 1000)
        };

        const individualInfo = new IndividualInfo(
            process.env.BAKONG_MERCHANT_ID || 'soklin_chen@bkrt',
            process.env.BAKONG_MERCHANT_NAME || 'SOKLIN CHEN',
            'Phnom Penh',
            optionalData
        );

        const khqr = new BakongKHQR();
        const response = khqr.generateIndividual(individualInfo);

        if (response.status.code !== 0) {
            throw new Error(response.status.message);
        }

        const qrText = response.data.qr;
        const md5Hash = response.data.md5;

        const order = new Order({
            orderId: customOrderId,
            user: user._id,
            items: orderItems,
            totalPrice: total,
            phone: ctx.session.checkoutData.phone,
            address: ctx.session.checkoutData.address,
            status: 'pending_payment',
            paymentStatus: 'pending',
            paymentHash: md5Hash
        });
        await order.save();

        // Store phone + address in user profile
        user.phone = ctx.session.checkoutData.phone;
        user.address = ctx.session.checkoutData.address;
        await user.save();

        // Clear Cart
        cart.items = [];
        await cart.save();

        ctx.session.state = null;
        ctx.session.checkoutData = null;

        // Generate QR Image Buffer
        const qrBuffer = await QRCode.toBuffer(qrText, { margin: 2, scale: 6 });

        const msg = `💳 *Scan QR Code to Pay*

🆔 *Order ID:* \`${customOrderId}\`
💰 *Amount:* $${total.toFixed(2)}

⏳ Please complete payment within 10 minutes.`;

        await ctx.replyWithPhoto({ source: qrBuffer }, {
            caption: msg,
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔄 Check Payment Status', `check_payment_${customOrderId}`)],
                [Markup.button.callback('❌ Cancel Order', `cancel_payment_${customOrderId}`)]
            ])
        });

        // Send styled order receipt image
        try {
            const receiptItems = orderItems.map(oi => {
                const prod = cart.items.find(ci => ci.product && ci.product._id.toString() === oi.product.toString());
                return {
                    name: prod ? prod.product.name : 'Product',
                    quantity: oi.quantity,
                    price: oi.price
                };
            });

            const receiptBuffer = await generateReceipt({
                orderId: customOrderId,
                user,
                phone: ctx.session.checkoutData ? ctx.session.checkoutData.phone : (user.phone || '—'),
                address: ctx.session.checkoutData ? ctx.session.checkoutData.address : (user.address || '—'),
                items: receiptItems,
                totalPrice: total,
                status: 'pending_payment',
                paymentStatus: 'pending',
                qrBuffer,
                createdAt: new Date()
            });

            await ctx.replyWithPhoto(
                { source: receiptBuffer },
                { caption: `🧾 *Order Receipt - ${customOrderId}*\nKeep this for your records.`, parse_mode: 'Markdown' }
            );
        } catch (receiptErr) {
            console.error('Failed to generate receipt image:', receiptErr);
            // Non-fatal — QR was already sent
        }

        await ctx.answerCbQuery();
    } catch (err) {
        // Restore stock
        for (let item of orderItems) {
            await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
        }
        console.error('Failed to process KHQR checkout:', err);
        await ctx.reply(`❌ Failed to process checkout: ${err.message}. Please try again later.`, mainMenu);
        await ctx.answerCbQuery();
    }
});

bot.action(/check_payment_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const order = await Order.findOne({ orderId }).populate('user');
    if (!order) return ctx.answerCbQuery('Order not found.', { show_alert: true });

    if (order.status !== 'pending_payment') {
        return ctx.answerCbQuery(`Order status is already: ${order.status.toUpperCase()}`, { show_alert: true });
    }

    const axios = require('axios');
    const url = `${process.env.BAKONG_DEV_BASE_API_URL}/check_transaction_by_md5`;
    
    try {
        const response = await axios.post(url, { md5: order.paymentHash }, {
            headers: {
                'Authorization': `Bearer ${process.env.BAKONG_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.data && response.data.status && response.data.status.code === 0 && response.data.data) {
            order.status = 'pending';
            order.paymentStatus = 'paid';
            await order.save();

            await ctx.replyWithMarkdown(`🎉 *Payment Successful!*\nYour order \`${order.orderId}\` is confirmed. Status: *PENDING*`, mainMenu);
            await ctx.answerCbQuery('Payment verified successfully!', { show_alert: true });
            
            try {
                await ctx.deleteMessage();
            } catch (e) {}
        } else {
            await ctx.answerCbQuery('⏳ Payment not found or still pending. Please scan the QR code and complete payment first.', { show_alert: true });
        }
    } catch (err) {
        console.error('Error verifying payment:', err.response ? err.response.data : err.message);
        await ctx.answerCbQuery('⚠️ API Error verifying payment. Please try again later.', { show_alert: true });
    }
});

bot.action(/cancel_payment_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const order = await Order.findOne({ orderId });
    if (!order) return ctx.answerCbQuery('Order not found.');

    if (order.status === 'pending_payment') {
        // Restore stock
        for (let item of order.items) {
            await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
        }
        order.status = 'cancelled';
        await order.save();
        await ctx.reply(`❌ Order ${order.orderId} cancelled.`, mainMenu);
        try {
            await ctx.deleteMessage();
        } catch (e) {}
    } else {
        await ctx.reply('This order cannot be cancelled as it is already paid or processed.');
    }
    await ctx.answerCbQuery();
});

bot.action('cancel_order', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.state = null;
    ctx.session.checkoutData = null;
    await ctx.reply('❌ Order cancelled.', mainMenu);
    await ctx.answerCbQuery();
});

// --- SEARCH ---
bot.hears('🔎 Search', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.state = 'search';
    await ctx.reply('Please enter the product name you are looking for:');
});

// --- ORDERS ---
bot.hears('📦 My Orders', async (ctx) => {
    const user = await getUser(ctx);
    const orders = await Order.find({ user: user._id }).populate('items.product').sort({ createdAt: -1 });

    if (orders.length === 0) {
        return ctx.reply('You have no orders yet.');
    }

    let msg = '*📦 Your Orders:*\n\n';
    for (let o of orders) {
        let itemList = '';
        o.items.forEach((item, index) => {
            const prodName = item.product ? item.product.name : 'Deleted Product';
            itemList += `  • ${prodName} (x${item.quantity}) - $${item.price * item.quantity}\n`;
        });
        msg += `🆔 *Order ID:* \`${o.orderId || o._id}\`\n📋 *Products:*\n${itemList}💰 *Total:* $${o.totalPrice}\n⚡ *Status:* ${o.status.toUpperCase()}\n📅 *Date:* ${o.createdAt.toDateString()}\n───────────────────\n\n`;
    }

    await ctx.replyWithMarkdown(msg);
});

// --- ADMIN PANEL ---
bot.command('admin', async (ctx) => {
    const user = await getUser(ctx);
    if (!user.isAdmin) {
        return ctx.reply('You do not have permission to access the Admin Panel.');
    }
    
    const adminMenu = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Add Product', 'admin_add_prod')],
        [Markup.button.callback('✏️ Manage Products', 'admin_manage_prods')],
        [Markup.button.callback('📦 Manage Orders', 'admin_manage_orders')]
    ]);
    
    await ctx.reply('⚙️ *Admin Control Panel*:', { parse_mode: 'Markdown', ...adminMenu });
});

bot.action('back_admin', async (ctx) => {
    const user = await getUser(ctx);
    if (!user.isAdmin) return ctx.answerCbQuery('Access Denied.');
    
    const adminMenu = Markup.inlineKeyboard([
        [Markup.button.callback('➕ Add Product', 'admin_add_prod')],
        [Markup.button.callback('✏️ Manage Products', 'admin_manage_prods')],
        [Markup.button.callback('📦 Manage Orders', 'admin_manage_orders')]
    ]);
    
    await ctx.reply('⚙️ *Admin Control Panel*:', { parse_mode: 'Markdown', ...adminMenu });
    await ctx.answerCbQuery();
});

// Admin: Add Product Flow
bot.action('admin_add_prod', async (ctx) => {
    ctx.session = ctx.session || {};
    ctx.session.state = 'admin_add_prod_name';
    ctx.session.newProduct = {};
    await ctx.reply('Enter product name:');
    await ctx.answerCbQuery();
});

// Admin: Manage Products
bot.action('admin_manage_prods', async (ctx) => {
    const categories = await Product.distinct('category');
    if (categories.length === 0) {
        return ctx.reply('No products/categories available.');
    }
    const buttons = categories.map(cat => [Markup.button.callback(cat, `admin_cat_${cat}`)]);
    buttons.push([Markup.button.callback('⬅️ Back to Admin', 'back_admin')]);
    await ctx.reply('Select category to manage:', Markup.inlineKeyboard(buttons));
    await ctx.answerCbQuery();
});

bot.action(/admin_cat_(.+)/, async (ctx) => {
    const category = ctx.match[1];
    const products = await Product.find({ category });
    if (products.length === 0) {
        return ctx.reply('No products in this category.');
    }
    const buttons = products.map(p => [Markup.button.callback(`${p.name} - $${p.price}`, `admin_prod_${p._id}`)]);
    buttons.push([Markup.button.callback('⬅️ Back to Categories', 'admin_manage_prods')]);
    await ctx.reply(`Select product to manage in ${category}:`, Markup.inlineKeyboard(buttons));
    await ctx.answerCbQuery();
});

bot.action(/admin_prod_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const product = await Product.findById(productId);
    if (!product) return ctx.reply('Product not found.');

    const message = `🛠️ *Manage Product: ${product.name}*\n\n📝 Description: ${product.description || 'N/A'}\n💰 Price: $${product.price}\n📊 Stock: ${product.stock}\n📂 Category: ${product.category}`;

    const buttons = [
        [Markup.button.callback('✏️ Edit Price', `admin_edit_price_${product._id}`), Markup.button.callback('✏️ Edit Stock', `admin_edit_stock_${product._id}`)],
        [Markup.button.callback('❌ Delete Product', `admin_delete_prod_${product._id}`)],
        [Markup.button.callback('⬅️ Back to Products', `admin_cat_${product.category}`)]
    ];

    const keyboard = Markup.inlineKeyboard(buttons);

    if (product.image) {
        try {
            await ctx.replyWithPhoto(product.image, {
                caption: message,
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (err) {
            await ctx.replyWithMarkdown(message, keyboard);
        }
    } else {
        await ctx.replyWithMarkdown(message, keyboard);
    }
    await ctx.answerCbQuery();
});

bot.action(/admin_edit_price_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    ctx.session = ctx.session || {};
    ctx.session.state = 'admin_edit_price';
    ctx.session.editProductId = productId;
    await ctx.reply('Enter new price (number):');
    await ctx.answerCbQuery();
});

bot.action(/admin_edit_stock_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    ctx.session = ctx.session || {};
    ctx.session.state = 'admin_edit_stock';
    ctx.session.editProductId = productId;
    await ctx.reply('Enter new stock level (number):');
    await ctx.answerCbQuery();
});

bot.action(/admin_delete_prod_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const product = await Product.findByIdAndDelete(productId);
    if (product) {
        await ctx.reply(`✅ Product "${product.name}" deleted successfully.`, mainMenu);
    } else {
        await ctx.reply('Product not found.');
    }
    await ctx.answerCbQuery();
});

// Admin: Manage Orders
bot.action('admin_manage_orders', async (ctx) => {
    const orders = await Order.find().populate('user').sort({ createdAt: -1 }).limit(10);
    if (orders.length === 0) return ctx.reply('No orders found.');

    const buttons = orders.map(o => [Markup.button.callback(`Order #${o._id.toString().slice(-6)} - ${o.status.toUpperCase()}`, `admin_view_order_${o._id}`)]);
    buttons.push([Markup.button.callback('⬅️ Back to Admin', 'back_admin')]);
    
    await ctx.reply('Select an order to view and manage status:', Markup.inlineKeyboard(buttons));
    await ctx.answerCbQuery();
});

bot.action(/admin_view_order_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const order = await Order.findById(orderId).populate('user').populate('items.product');
    if (!order) return ctx.reply('Order not found.');

    let itemDetails = '';
    order.items.forEach((item, index) => {
        const name = item.product ? item.product.name : 'Unknown Product';
        itemDetails += `${index + 1}. ${name} (x${item.quantity}) - $${item.price * item.quantity}\n`;
    });

    const msg = `📦 *Order Details*
ID: \`${order.orderId || order._id}\`
User: ${order.user ? order.user.firstName : 'Unknown'}
Phone: ${order.phone}
Address: ${order.address}
Status: *${order.status.toUpperCase()}*
Payment Status: *${(order.paymentStatus || 'pending').toUpperCase()}*
Date: ${order.createdAt.toDateString()}

*Items:*
${itemDetails}
*Total: $${order.totalPrice}*`;

    const buttons = [];
    if (order.status === 'pending_payment') {
        buttons.push([Markup.button.callback('💵 Confirm Payment Manually', `admin_status_${order._id}_pending`)]);
    }
    buttons.push([
        Markup.button.callback('🚚 Ship Order', `admin_status_${order._id}_shipping`),
        Markup.button.callback('✅ Complete Order', `admin_status_${order._id}_completed`)
    ]);
    buttons.push([
        Markup.button.callback('⏳ Set Pending', `admin_status_${order._id}_pending`),
        Markup.button.callback('⬅️ Back to Orders', 'admin_manage_orders')
    ]);

    await ctx.replyWithMarkdown(msg, Markup.inlineKeyboard(buttons));
    await ctx.answerCbQuery();
});

bot.action(/admin_status_(.+)_(pending|shipping|completed)/, async (ctx) => {
    const orderId = ctx.match[1];
    const newStatus = ctx.match[2];

    const order = await Order.findById(orderId);
    if (!order) return ctx.reply('Order not found.');

    const oldStatus = order.status;
    order.status = newStatus;
    
    if (newStatus === 'pending' && oldStatus === 'pending_payment') {
        order.paymentStatus = 'paid';
    }
    await order.save();

    await ctx.answerCbQuery(`Order status updated to ${newStatus}!`);
    await ctx.reply(`Order status updated to *${newStatus.toUpperCase()}*`, mainMenu);

    // Notify customer
    try {
        const user = await User.findById(order.user);
        if (user) {
            let notification = '';
            if (newStatus === 'pending' && oldStatus === 'pending_payment') {
                notification = `🎉 *Payment Successful!*\nYour order \`${order.orderId}\` has been confirmed.`;
            } else if (newStatus === 'shipping') {
                notification = `🚚 Your order \`${order.orderId}\` has been shipped!`;
            } else if (newStatus === 'completed') {
                notification = `✅ Your order \`${order.orderId}\` is completed! Thank you for shopping with us.`;
            }
            if (notification) {
                await bot.telegram.sendMessage(user.telegramId, notification, { parse_mode: 'Markdown' });
            }
        }
    } catch (e) {
        console.error('Failed to send status notification:', e);
    }
});

// --- GENERAL PHOTO HANDLER (FOR PRODUCT IMAGES) ---
bot.on('photo', async (ctx) => {
    const user = await getUser(ctx);
    ctx.session = ctx.session || {};
    const state = ctx.session.state;

    if (state === 'admin_add_prod_image' && user.isAdmin) {
        const photo = ctx.message.photo;
        const fileId = photo[photo.length - 1].file_id;
        ctx.session.newProduct.image = fileId;

        const prod = new Product(ctx.session.newProduct);
        await prod.save();
        ctx.session.state = null;
        ctx.session.newProduct = null;
        return ctx.reply(`✅ Product "${prod.name}" added successfully with image!`, mainMenu);
    }
});

// --- GENERAL TEXT HANDLER (FOR STATES) ---
bot.on('text', async (ctx) => {
    const user = await getUser(ctx);
    ctx.session = ctx.session || {};
    const state = ctx.session.state;

    // Search logic
    if (state === 'search') {
        const query = ctx.message.text;
        const products = await Product.find({ name: { $regex: query, $options: 'i' } });
        ctx.session.state = null;

        if (products.length === 0) {
            return ctx.reply('No products found matching your search.', mainMenu);
        }

        const buttons = products.map(p => [Markup.button.callback(`${p.name} - $${p.price}`, `prod_${p._id}`)]);
        return ctx.reply(`Search results for "${query}":`, Markup.inlineKeyboard(buttons));
    }

    // Checkout Logic
    if (state === 'checkout_phone') {
        const phone = ctx.message.text.trim();
        // Validate phone: only numbers, 9-12 digits
        const phoneRegex = /^\d{9,12}$/;
        if (!phoneRegex.test(phone)) {
            return ctx.reply('⚠️ Invalid phone number. Please enter only numbers (9 to 12 digits):', Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Back to Cart', 'show_cart')]
            ]));
        }

        ctx.session.checkoutData = { phone };
        ctx.session.state = 'checkout_address';
        return ctx.reply('🏠 Please enter your delivery address:', Markup.inlineKeyboard([
            [Markup.button.callback('⬅️ Back to Phone', 'checkout')]
        ]));
    }

    if (state === 'checkout_address') {
        const address = ctx.message.text.trim();
        if (!address) {
            return ctx.reply('⚠️ Address is required. Please enter your delivery address:', Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Back to Phone', 'checkout')]
            ]));
        }

        ctx.session.checkoutData.address = address;
        ctx.session.state = 'checkout_confirm';

        // Retrieve cart info to display summary
        const cart = await Cart.findOne({ user: user._id }).populate('items.product');
        if (!cart || cart.items.length === 0) {
            ctx.session.state = null;
            return ctx.reply('Your cart is empty. Cannot proceed to checkout.', mainMenu);
        }

        let total = 0;
        let itemsList = '';
        cart.items.forEach(item => {
            if (item.product) {
                total += item.product.price * item.quantity;
                itemsList += `- ${item.product.name} x${item.quantity}\n`;
            }
        });

        ctx.session.checkoutData.totalPrice = total;

        const summary = `🧾 *Order Summary*

📱 Phone: ${ctx.session.checkoutData.phone}
🏠 Address: ${address}

🛒 Items:
${itemsList}
💰 Total: $${total.toFixed(2)}

Please click the button below to complete payment:`;

        return ctx.replyWithMarkdown(summary, Markup.inlineKeyboard([
            [
                Markup.button.callback('💳 Pay Now', 'pay_now'),
                Markup.button.callback('❌ Cancel', 'cancel_order')
            ]
        ]));
    }

    // Admin Add Product Logic
    if (state && state.startsWith('admin_add_prod_') && user.isAdmin) {
        if (state === 'admin_add_prod_name') {
            ctx.session.newProduct.name = ctx.message.text;
            ctx.session.state = 'admin_add_prod_desc';
            return ctx.reply('Enter product description:');
        }
        if (state === 'admin_add_prod_desc') {
            ctx.session.newProduct.description = ctx.message.text;
            ctx.session.state = 'admin_add_prod_price';
            return ctx.reply('Enter product price (number):');
        }
        if (state === 'admin_add_prod_price') {
            const price = parseFloat(ctx.message.text);
            if (isNaN(price)) {
                return ctx.reply('Invalid price. Please enter a valid number:');
            }
            ctx.session.newProduct.price = price;
            ctx.session.state = 'admin_add_prod_cat';
            return ctx.reply('Enter product category:');
        }
        if (state === 'admin_add_prod_cat') {
            ctx.session.newProduct.category = ctx.message.text;
            ctx.session.state = 'admin_add_prod_stock';
            return ctx.reply('Enter product stock (number):');
        }
        if (state === 'admin_add_prod_stock') {
            const stock = parseInt(ctx.message.text);
            if (isNaN(stock)) {
                return ctx.reply('Invalid stock. Please enter a valid integer:');
            }
            ctx.session.newProduct.stock = stock;
            ctx.session.state = 'admin_add_prod_image';
            return ctx.reply('Send product image (Send a photo, paste an image URL, or type "skip"):');
        }
        if (state === 'admin_add_prod_image') {
            const text = ctx.message.text;
            if (text.toLowerCase() !== 'skip') {
                ctx.session.newProduct.image = text;
            }
            
            // Save Product
            const prod = new Product(ctx.session.newProduct);
            await prod.save();
            ctx.session.state = null;
            ctx.session.newProduct = null;
            return ctx.reply(`✅ Product "${prod.name}" added successfully!`, mainMenu);
        }
    }

    // Admin Edit Product Logic
    if (state === 'admin_edit_price' && user.isAdmin) {
        const price = parseFloat(ctx.message.text);
        if (isNaN(price)) {
            return ctx.reply('Invalid number. Please enter a valid price:');
        }
        await Product.findByIdAndUpdate(ctx.session.editProductId, { price });
        ctx.session.state = null;
        ctx.session.editProductId = null;
        return ctx.reply('✅ Product price updated successfully!', mainMenu);
    }

    if (state === 'admin_edit_stock' && user.isAdmin) {
        const stock = parseInt(ctx.message.text);
        if (isNaN(stock)) {
            return ctx.reply('Invalid number. Please enter a valid stock level:');
        }
        await Product.findByIdAndUpdate(ctx.session.editProductId, { stock });
        ctx.session.state = null;
        ctx.session.editProductId = null;
        return ctx.reply('✅ Product stock updated successfully!', mainMenu);
    }
});

// Add a simple express server to keep the process alive/healthy if deployed to cloud
const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();
app.use(express.json());
app.use(cors({
    origin: '*',
    credentials: true
}));

// Admin Dashboard
const adminApiRouter = require('./dashboard/api');
app.use('/admin/api', adminApiRouter);
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'index.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'dashboard', 'login.html')));

app.get('/', (req, res) => res.send('Bot is running'));

// Webhook for Auto Payment Verification
app.post('/payment-webhook', async (req, res) => {
    try {
        console.log('Payment Webhook Received:', req.body);
        const { md5, orderId, hash } = req.body;
        
        let query = {};
        if (md5) query.paymentHash = md5;
        else if (orderId) query.orderId = orderId;
        else if (hash) query.paymentHash = hash;
        else return res.status(400).json({ error: 'Missing payment hash or order ID identifier' });

        const order = await Order.findOne(query).populate('user');
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        if (order.status === 'pending_payment') {
            order.status = 'pending';
            order.paymentStatus = 'paid';
            await order.save();

            // Notify user via Telegram Bot
            if (order.user && order.user.telegramId) {
                await bot.telegram.sendMessage(
                    order.user.telegramId, 
                    `🎉 *Payment Successful!*\n\nYour order \`${order.orderId}\` has been confirmed successfully.\n📦 *Status:* Pending (Paid)`,
                    { parse_mode: 'Markdown' }
                );
            }
            console.log(`Payment confirmed via webhook for Order: ${order.orderId}`);
        }

        res.json({ success: true, message: 'Payment verified' });
    } catch (err) {
        console.error('Webhook error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Express server running on port ${port}`);
});

// Global Error Handler
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
});

// Start bot
bot.launch().then(() => console.log('Bot started')).catch(console.error);

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
