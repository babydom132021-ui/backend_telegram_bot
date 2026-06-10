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

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('MongoDB connected');
        await seedProducts();
        await resumePendingOrderPolling();
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

// Localization Translations
const translations = {
    en: {
        welcome: "Welcome to our E-commerce Store! 🏪\nPlease choose an option below:",
        menu_shop: "🛍️ Shop Products",
        menu_search: "🔎 Search",
        menu_cart: "🛒 My Cart",
        menu_orders: "📦 My Orders",
        menu_lang: "🌐 Language / ភាសា",
        select_lang: "Please select your preferred language:",
        lang_updated: "Language updated to English! 🇺🇸",
        no_categories: "No products available at the moment.",
        select_category: "Select a category:",
        no_products_cat: "No products in this category.",
        showing_products: "Showing products in *{category}*:",
        add_to_cart: "Add to Cart 🛒",
        view_details: "View Details ℹ️",
        back_categories: "⬅️ Back to Categories",
        product_not_found: "Product not found.",
        price: "Price",
        stock: "Stock",
        out_of_stock: "Out of stock",
        no_description: "No description",
        empty_cart: "Your cart is empty. 🛒",
        cart_title: "*🛒 Your Cart:*\n\n",
        qty: "Qty",
        remove: "❌ Remove",
        total_price: "Total Price",
        checkout: "💳 Checkout",
        clear_cart: "🗑️ Clear Cart",
        cart_cleared: "Cart cleared.",
        back_cart: "⬅️ Back to Cart",
        enter_phone: "📱 Please enter your phone number:",
        invalid_phone: "⚠️ Invalid phone number. Please enter only numbers (9 to 12 digits):",
        back_phone: "⬅️ Back to Phone",
        enter_address: "🏠 Please enter your delivery address:",
        address_required: "⚠️ Address is required. Please enter your delivery address:",
        order_summary: "🧾 *Order Summary*",
        summary_phone: "Phone",
        summary_address: "Address",
        summary_items: "Items",
        summary_total: "Total",
        pay_now_btn: "💳 Pay Now",
        cancel_btn: "❌ Cancel",
        no_active_order: "No active order confirmation found.",
        empty_cart_proceed: "Your cart is empty. Cannot proceed.",
        items_out_of_stock: "All items in your cart are currently out of stock. Order cancelled.",
        scan_pay: "💳 *Scan QR Code to Pay*",
        order_id: "Order ID",
        amount: "Amount",
        scan_exp: "⏳ Please complete payment within 10 minutes.",
        check_status: "🔄 Check Payment Status",
        cancel_order_btn: "❌ Cancel Order",
        receipt_title: "🧾 *Order Receipt - {orderId}*\nKeep this for your records.",
        checkout_failed: "❌ Failed to process checkout: {error}. Please try again later.",
        order_not_found: "Order not found.",
        status_already: "Order status is already: {status}",
        payment_success: "🎉 *Payment Successful!*\nYour order `{orderId}` has been confirmed successfully.\n📦 *Status:* Pending (Paid)",
        payment_verified: "Payment verified successfully!",
        payment_pending: "⏳ Payment not found or still pending. Please scan the QR code and complete payment first.",
        api_error: "⚠️ API Error verifying payment. Please try again later.",
        payment_success_popup: "Payment Successful 🎉",
        payment_pending_popup: "Payment Pending ⏳ Please wait",
        payment_failed_popup: "Payment Failed ❌ Try again",
        order_cancelled: "❌ Order {orderId} cancelled.",
        order_cannot_cancel: "This order cannot be cancelled as it is already paid or processed.",
        search_prompt: "Please enter the product name you are looking for:",
        no_products_search: "No products found matching your search.",
        search_results: "Search results for \"{query}\":",
        no_orders: "You have no orders yet.",
        orders_title: "*📦 Your Orders:*\n\n",
        deleted_product: "Deleted Product",
        order_details_id: "Order ID",
        order_details_products: "Products",
        order_details_total: "Total",
        order_details_status: "Status",
        order_details_date: "Date"
    },
    km: {
        welcome: "សូមស្វាគមន៍មកកាន់ហាងទំនិញរបស់យើង! 🏪\nសូមជ្រើសរើសជម្រើសខាងក្រោម៖",
        menu_shop: "🛍️ ទិញទំនិញ",
        menu_search: "🔎 ស្វែងរក",
        menu_cart: "🛒 រទេះរបស់ខ្ញុំ",
        menu_orders: "📦 ការបញ្ជាទិញរបស់ខ្ញុំ",
        menu_lang: "🌐 Language / ភាសា",
        select_lang: "សូមជ្រើសរើសភាសាដែលអ្នកពេញចិត្ត៖",
        lang_updated: "ភាសាត្រូវបានផ្លាស់ប្តូរទៅជាភាសាខ្មែរ! 🇰🇭",
        no_categories: "មិនមានទំនិញនៅពេលនេះទេ។",
        select_category: "ជ្រើសរើសប្រភេទ៖",
        no_products_cat: "មិនមានទំនិញនៅក្នុងប្រភេទនេះទេ។",
        showing_products: "កំពុងបង្ហាញទំនិញនៅក្នុងប្រភេទ *{category}*៖",
        add_to_cart: "ដាក់ក្នុងរទេះ 🛒",
        view_details: "មើលព័ត៌មានលម្អិត ℹ️",
        back_categories: "⬅️ ត្រឡប់ទៅប្រភេទ",
        product_not_found: "រកមិនឃើញទំនិញឡើយ។",
        price: "តម្លៃ",
        stock: "ស្តុក",
        out_of_stock: "អស់ពីស្តុក",
        no_description: "គ្មានការពិពណ៌នា",
        empty_cart: "រទេះរបស់អ្នកគឺទទេរ។ 🛒",
        cart_title: "*🛒 រទេះរបស់អ្នក:*\n\n",
        qty: "ចំនួន",
        remove: "❌ លុបចេញ",
        total_price: "តម្លៃសរុប",
        checkout: "💳 ទូទាត់ប្រាក់",
        clear_cart: "🗑️ សំអាតរទេះ",
        cart_cleared: "បានសំអាតរទេះរួចរាល់។",
        back_cart: "⬅️ ត្រឡប់ទៅរទេះវិញ",
        enter_phone: "📱 សូមបញ្ចូលលេខទូរស័ព្ទរបស់អ្នក៖",
        invalid_phone: "⚠️ លេខទូរស័ព្ទមិនត្រឹមត្រូវឡើយ។ សូមបញ្ចូលតែលេខ (ពី ៩ ទៅ ១២ ខ្ទង់)៖",
        back_phone: "⬅️ ត្រឡប់ទៅលេខទូរស័ព្ទ",
        enter_address: "🏠 សូមបញ្ចូលអាសយដ្ឋានដឹកជញ្ជូនរបស់អ្នក៖",
        address_required: "⚠️ អាសយដ្ឋានគឺចាំបាច់ត្រូវមាន។ សូមបញ្ចូលអាសយដ្ឋានដឹកជញ្ជូនរបស់អ្នក៖",
        order_summary: "🧾 *សេចក្តីសង្ខេបនៃការបញ្ជាទិញ*",
        summary_phone: "ទូរស័ព្ទ",
        summary_address: "អាសយដ្ឋាន",
        summary_items: "ទំនិញ",
        summary_total: "សរុប",
        pay_now_btn: "💳 ទូទាត់ឥឡូវនេះ",
        cancel_btn: "❌ បោះបង់",
        no_active_order: "រកមិនឃើញការបញ្ជាក់ការបញ្ជាទិញសកម្មឡើយ។",
        empty_cart_proceed: "រទេះរបស់អ្នកគឺទទេ។ មិនអាចបន្តដំណើរការបានទេ។",
        items_out_of_stock: "ទំនិញទាំងអស់នៅក្នុងរទេះរបស់អ្នកត្រូវបានអស់ពីស្តុក។ ការបញ្ជាទិញត្រូវបានបោះបង់។",
        scan_pay: "💳 *ស្កែនកូដ QR ដើម្បីទូទាត់ប្រាក់*",
        order_id: "លេខសំគាល់ការបញ្ជាទិញ",
        amount: "ចំនួនទឹកប្រាក់",
        scan_exp: "⏳ សូមបញ្ចប់ការទូទាត់ក្នុងរយៈពេល ១០ នាទី។",
        check_status: "🔄 ពិនិត្យស្ថានភាពទូទាត់",
        cancel_order_btn: "❌ បោះបង់ការបញ្ជាទិញ",
        receipt_title: "🧾 *វិក្កយបត្របញ្ជាទិញ - {orderId}*\nរក្សាទុកវាសម្រាប់កំណត់ត្រារបស់អ្នក។",
        checkout_failed: "❌ ការទូទាត់បរាជ័យ៖ {error}។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។",
        order_not_found: "រកមិនឃើញការបញ្ជាទិញឡើយ។",
        status_already: "ស្ថានភាពនៃការបញ្ជាទិញគឺរួចហើយ៖ {status}",
        payment_success: "🎉 *ការទូទាត់ជោគជ័យ!*\nការបញ្ជាទិញរបស់អ្នក `{orderId}` ត្រូវបានបញ្ជាក់រួចរាល់។\n📦 *ស្ថានភាព:* កំពុងរង់ចាំ (បង់ប្រាក់រួច)",
        payment_verified: "ការទូទាត់ត្រូវបានផ្ទៀងផ្ទាត់ដោយជោគជ័យ!",
        payment_pending: "⏳ មិនទាន់រកឃើញការទូទាត់ ឬកំពុងរង់ចាំ។ សូមស្កែនកូដ QR ហើយបញ្ចប់ការទូទាត់ជាមុនសិន។",
        api_error: "⚠️ កំហុស API ក្នុងការផ្ទៀងផ្ទាត់ការទូទាត់។ សូមព្យាយាមម្តងទៀតនៅពេលក្រោយ។",
        payment_success_popup: "ការទូទាត់ជោគជ័យ 🎉",
        payment_pending_popup: "កំពុងរង់ចាំការទូទាត់ ⏳ សូមរង់ចាំ",
        payment_failed_popup: "ការទូទាត់បរាជ័យ ❌ ព្យាយាមម្តងទៀត",
        order_cancelled: "❌ ការបញ្ជាទិញ {orderId} ត្រូវបានបោះបង់។",
        order_cannot_cancel: "ការបញ្ជាទិញនេះមិនអាចបោះបង់បានទេ ព្រោះវាត្រូវបានបង់ប្រាក់ ឬដំណើរការរួចហើយ។",
        search_prompt: "សូមបញ្ចូលឈ្មោះទំនិញដែលអ្នកកំពុងស្វែងរក៖",
        no_products_search: "រកមិនឃើញទំនិញដែលត្រូវនឹងការស្វែងរករបស់អ្នកទេ។",
        search_results: "លទ្ធផលស្វែងរកសម្រាប់ \"{query}\"៖",
        no_orders: "អ្នកមិនទាន់មានការបញ្ជាទិញនៅឡើយទេ។",
        orders_title: "*📦 ការបញ្ជាទិញរបស់អ្នក:*\n\n",
        deleted_product: "ផលិតផលត្រូវបានលុប",
        order_details_id: "លេខសំគាល់ការបញ្ជាទិញ",
        order_details_products: "ផលិតផល",
        order_details_total: "សរុប",
        order_details_status: "ស្ថានភាព",
        order_details_date: "កាលបរិច្ឆេទ"
    }
};

// --- REAL-TIME PAYMENT POLLING SYSTEM ---
const activePollers = {};

function startPaymentPolling(orderId, userId, chatId, lang, messageId = null) {
    if (activePollers[orderId]) return;

    const intervalTime = 7000; // Check every 7 seconds
    const expireTime = Date.now() + 10 * 60 * 1000; // Expire after 10 minutes

    const timer = setInterval(async () => {
        if (Date.now() > expireTime) {
            clearInterval(timer);
            delete activePollers[orderId];
            
            try {
                const order = await Order.findOne({ orderId });
                if (order && order.status === 'pending_payment') {
                    for (let item of order.items) {
                        await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
                    }
                    order.status = 'cancelled';
                    await order.save();

                    await bot.telegram.sendMessage(
                        chatId,
                        lang === 'km'
                            ? `⚠️ ការបញ្ជាទិញ #${orderId.slice(-8)} ត្រូវបានបោះបង់ដោយស្វ័យប្រវត្ត ដោយសារតែមិនមានការទូទាត់ក្នុងរយៈពេល ១០ នាទី។`
                            : `⚠️ Order #${orderId.slice(-8)} was automatically cancelled because no payment was received within 10 minutes.`,
                        getMainMenu(lang)
                    );

                    if (messageId) {
                        try {
                            await bot.telegram.deleteMessage(chatId, messageId);
                        } catch (e) {}
                    }
                }
            } catch (err) {
                console.error(`Error in timeout handling for order ${orderId}:`, err);
            }
            return;
        }

        try {
            const order = await Order.findOne({ orderId });
            if (!order || order.status !== 'pending_payment') {
                clearInterval(timer);
                delete activePollers[orderId];
                return;
            }

            const axios = require('axios');
            const url = `${process.env.BAKONG_DEV_BASE_API_URL}/check_transaction_by_md5`;
            const response = await axios.post(url, { md5: order.paymentHash }, {
                headers: {
                    'Authorization': `Bearer ${process.env.BAKONG_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.data && response.data.status && response.data.status.code === 0 && response.data.data) {
                const updatedOrder = await Order.findOneAndUpdate(
                    { orderId, status: 'pending_payment' },
                    { status: 'pending', paymentStatus: 'paid' },
                    { new: true }
                );

                if (updatedOrder) {
                    const t = translations[lang] || translations.en;
                    await bot.telegram.sendMessage(
                        chatId,
                        t.payment_success.replace('{orderId}', orderId),
                        { parse_mode: 'Markdown', ...getMainMenu(lang) }
                    );

                    if (messageId) {
                        try {
                            await bot.telegram.deleteMessage(chatId, messageId);
                        } catch (e) {}
                    }
                }

                clearInterval(timer);
                delete activePollers[orderId];
            }
        } catch (err) {
            console.error(`Error in background polling for order ${orderId}:`, err.message);
        }
    }, intervalTime);

    activePollers[orderId] = timer;
}

async function resumePendingOrderPolling() {
    try {
        const pendingOrders = await Order.find({ status: 'pending_payment' }).populate('user');
        console.log(`Resuming background payment polling for ${pendingOrders.length} pending orders...`);
        for (const order of pendingOrders) {
            if (order.user && order.user.telegramId) {
                const lang = order.user.language || 'en';
                startPaymentPolling(order.orderId, order.user._id, order.user.telegramId, lang);
            }
        }
    } catch (err) {
        console.error('Failed to resume pending order polling:', err);
    }
}

function getMainMenu(lang) {
    const t = translations[lang] || translations.en;
    return Markup.keyboard([
        [t.menu_shop, t.menu_search],
        [t.menu_cart, t.menu_orders],
        [t.menu_lang]
    ]).resize();
}

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
            language: tgUser.language_code === 'km' ? 'km' : 'en',
            isAdmin: false
        });
        await user.save();
    }
    return user;
}

bot.start(async (ctx) => {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    ctx.session = ctx.session || {};
    ctx.session.state = null;
    await ctx.reply(t.welcome, getMainMenu(lang));
});

bot.command('adminsecret', async (ctx) => {
    const user = await getUser(ctx);
    user.isAdmin = true;
    await user.save();
    return ctx.reply('You are now an Admin! ⚙️ Click "⚙️ Admin Panel" from the main menu.');
});

// --- LANGUAGE TOGGLE HANDLER ---
bot.hears(['🌐 Language / ភាសា'], async (ctx) => {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    
    await ctx.reply(t.select_lang, Markup.inlineKeyboard([
        [
            Markup.button.callback('🇺🇸 English', 'set_lang_en'),
            Markup.button.callback('🇰🇭 ភាសាខ្មែរ', 'set_lang_km')
        ]
    ]));
});

bot.action('set_lang_en', async (ctx) => {
    const user = await getUser(ctx);
    user.language = 'en';
    await user.save();
    const t = translations.en;
    await ctx.reply(t.lang_updated, getMainMenu('en'));
    await ctx.answerCbQuery();
});

bot.action('set_lang_km', async (ctx) => {
    const user = await getUser(ctx);
    user.language = 'km';
    await user.save();
    const t = translations.km;
    await ctx.reply(t.lang_updated, getMainMenu('km'));
    await ctx.answerCbQuery();
});

// --- SHOP PRODUCTS & CATEGORIES ---
bot.hears(['🛍️ Shop Products', '🛍️ ទិញទំនិញ'], async (ctx) => {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    
    const categories = await Product.distinct('category');
    if (categories.length === 0) {
        return ctx.reply(t.no_categories);
    }
    const buttons = categories.map(cat => [Markup.button.callback(cat, `cat_${cat}`)]);
    await ctx.reply(t.select_category, Markup.inlineKeyboard(buttons));
});

bot.action(/cat_(.+)/, async (ctx) => {
    const category = ctx.match[1];
    // Prevent matching 'manage' or other admin callbacks
    if (category.startsWith('manage') || category.startsWith('view_order')) return;

    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;

    const products = await Product.find({ category });
    if (products.length === 0) {
        return ctx.reply(t.no_products_cat);
    }

    await ctx.reply(t.showing_products.replace('{category}', category), { parse_mode: 'Markdown' });

    for (const p of products) {
        const message = `🛍️ *${p.name}*\n💰 ${t.price}: $${p.price}`;
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback(t.add_to_cart, `add_${p._id}`),
                Markup.button.callback(t.view_details, `prod_${p._id}`)
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
                await ctx.replyWithMarkdown(message + `\n\n⚠️ (${lang === 'km' ? 'រូបភាពមិនអាចទាញយកបានទេ' : 'Image failed to load'})`, keyboard);
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

    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;

    const product = await Product.findById(productId);
    if (!product) return ctx.reply(t.product_not_found);

    const message = `📦 *${product.name}*\n\n📝 ${product.description || t.no_description}\n\n💰 ${t.price}: $${product.price}\n📊 ${t.stock}: ${product.stock > 0 ? product.stock : t.out_of_stock}`;
    
    const buttons = [];
    if (product.stock > 0) {
        buttons.push([Markup.button.callback(t.add_to_cart, `add_${product._id}`)]);
    }
    buttons.push([Markup.button.callback(t.back_categories, 'back_cats')]);

    const keyboard = Markup.inlineKeyboard(buttons);

    if (product.image) {
        try {
            await ctx.replyWithPhoto(product.image, {
                caption: message,
                parse_mode: 'Markdown',
                ...keyboard
            });
        } catch (err) {
            await ctx.replyWithMarkdown(message + `\n\n⚠️ (${lang === 'km' ? 'រូបភាពមិនអាចទាញយកបានទេ' : 'Image failed to load'})`, keyboard);
        }
    } else {
        await ctx.replyWithMarkdown(message, keyboard);
    }
    await ctx.answerCbQuery();
});

bot.action('back_cats', async (ctx) => {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;

    const categories = await Product.distinct('category');
    const buttons = categories.map(cat => [Markup.button.callback(cat, `cat_${cat}`)]);
    await ctx.reply(t.select_category, Markup.inlineKeyboard(buttons));
    await ctx.answerCbQuery();
});

// --- CART SYSTEM HELPERS & HANDLERS ---
async function viewCart(ctx) {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    const cart = await Cart.findOne({ user: user._id }).populate('items.product');

    if (!cart || cart.items.length === 0) {
        const emptyMsg = t.empty_cart;
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

    let message = t.cart_title;
    let total = 0;
    const buttons = [];

    cart.items.forEach((item) => {
        if (!item.product) return;
        const itemTotal = item.product.price * item.quantity;
        total += itemTotal;
        message += `📦 *${item.product.name}*\n   ${t.price}: $${item.product.price} | ${t.qty}: ${item.quantity}\n   Subtotal: $${itemTotal}\n\n`;
        
        buttons.push([
            Markup.button.callback(`➖`, `dec_${item.product._id}`),
            Markup.button.callback(`${t.qty}: ${item.quantity}`, `noop`),
            Markup.button.callback(`➕`, `inc_${item.product._id}`),
            Markup.button.callback(t.remove, `rm_${item.product._id}`)
        ]);
    });

    message += `*${t.total_price}: $${total}*`;
    
    if (total > 0) {
        buttons.push([
            Markup.button.callback(t.checkout, 'checkout'),
            Markup.button.callback(t.clear_cart, 'clear_cart')
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
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    const product = await Product.findById(productId);
    
    if (!product || product.stock <= 0) {
        return ctx.answerCbQuery(lang === 'km' ? 'អស់ពីស្តុក ឬរកមិនឃើញផលិតផល។' : 'Out of stock or not found.', { show_alert: true });
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
    
    const addedMsg = lang === 'km' ? `បានដាក់ ${product.name} ទៅក្នុងរទេះ!` : `${product.name} added to cart!`;
    await ctx.answerCbQuery(addedMsg);
    await ctx.reply(`🛒 ${lang === 'km' ? `បានដាក់ចូលក្នុងរទេះ៖` : 'Added'} *${product.name}* ${lang === 'km' ? 'រួចរាល់!' : 'to your cart!'}`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback(t.menu_cart, 'show_cart')]
        ])
    });
});

bot.hears(['🛒 My Cart', '🛒 រទេះរបស់ខ្ញុំ'], async (ctx) => {
    await viewCart(ctx);
});

bot.action(/rm_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const cart = await Cart.findOne({ user: user._id });

    if (cart) {
        cart.items = cart.items.filter(item => item.product && item.product.toString() !== productId);
        cart.markModified('items');
        await cart.save();
        await ctx.answerCbQuery(lang === 'km' ? 'បានលុបទំនិញ។' : 'Item removed.');
        await viewCart(ctx);
    }
});

bot.action(/dec_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const cart = await Cart.findOne({ user: user._id });
    if (!cart) return ctx.answerCbQuery(lang === 'km' ? 'រទេះគឺទទេរ។' : 'Cart is empty.');

    const itemIndex = cart.items.findIndex(item => item.product && item.product.toString() === productId);
    if (itemIndex > -1) {
        if (cart.items[itemIndex].quantity > 1) {
            cart.items[itemIndex].quantity -= 1;
            await cart.save();
            await ctx.answerCbQuery(lang === 'km' ? 'បានកាត់បន្ថយចំនួន។' : 'Quantity decreased.');
        } else {
            cart.items = cart.items.filter(item => item.product && item.product.toString() !== productId);
            cart.markModified('items');
            await cart.save();
            await ctx.answerCbQuery(lang === 'km' ? 'បានលុបទំនិញពីរទេះ។' : 'Item removed from cart.');
        }
        await viewCart(ctx);
    } else {
        await ctx.answerCbQuery(lang === 'km' ? 'រកមិនឃើញទំនិញក្នុងរទេះឡើយ។' : 'Item not found in cart.');
    }
});

bot.action(/inc_(.+)/, async (ctx) => {
    const productId = ctx.match[1];
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const product = await Product.findById(productId);
    if (!product) return ctx.answerCbQuery(lang === 'km' ? 'រកមិនឃើញផលិតផលឡើយ។' : 'Product not found.');

    const cart = await Cart.findOne({ user: user._id });
    if (!cart) return ctx.answerCbQuery(lang === 'km' ? 'រទេះគឺទទេរ។' : 'Cart is empty.');

    const itemIndex = cart.items.findIndex(item => item.product && item.product.toString() === productId);
    if (itemIndex > -1) {
        if (product.stock > cart.items[itemIndex].quantity) {
            cart.items[itemIndex].quantity += 1;
            await cart.save();
            await ctx.answerCbQuery(lang === 'km' ? 'បានបង្កើនចំនួន។' : 'Quantity increased.');
        } else {
            const stockMsg = lang === 'km' 
                ? `មិនអាចបន្ថែមបានទៀតទេ។ សល់ត្រឹមតែ ${product.stock} គ្រឿងក្នុងស្តុក។` 
                : `Cannot add more. Only ${product.stock} items left in stock.`;
            await ctx.answerCbQuery(stockMsg, { show_alert: true });
        }
        await viewCart(ctx);
    } else {
        await ctx.answerCbQuery(lang === 'km' ? 'រកមិនឃើញទំនិញក្នុងរទេះឡើយ។' : 'Item not found in cart.');
    }
});

bot.action('clear_cart', async (ctx) => {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    await Cart.findOneAndUpdate({ user: user._id }, { items: [] });
    await ctx.answerCbQuery(t.cart_cleared, { show_alert: true });
    await viewCart(ctx);
});

bot.action('checkout', async (ctx) => {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    ctx.session = ctx.session || {};
    ctx.session.state = 'checkout_phone';
    await ctx.reply(t.enter_phone, Markup.inlineKeyboard([
        [Markup.button.callback(t.back_cart, 'show_cart')]
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
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;

    if (ctx.session.state !== 'checkout_confirm' || !ctx.session.checkoutData) {
        return ctx.reply(t.no_active_order, getMainMenu(lang));
    }

    const cart = await Cart.findOne({ user: user._id }).populate('items.product');
    if (!cart || cart.items.length === 0) {
        ctx.session.state = null;
        return ctx.reply(t.empty_cart_proceed, getMainMenu(lang));
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
        return ctx.reply(t.items_out_of_stock, getMainMenu(lang));
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

        const msg = `${t.scan_pay}

🆔 *${t.order_id}:* \`${customOrderId}\`
💰 *${t.amount}:* $${total.toFixed(2)}

${t.scan_exp}`;

        const sentMsg = await ctx.replyWithPhoto({ source: qrBuffer }, {
            caption: msg,
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback(t.check_status, `check_payment_${customOrderId}`)],
                [Markup.button.callback(t.cancel_order_btn, `cancel_payment_${customOrderId}`)]
            ])
        });

        startPaymentPolling(customOrderId, user._id, ctx.chat.id, lang, sentMsg.message_id);


        await ctx.answerCbQuery();
    } catch (err) {
        // Restore stock
        for (let item of orderItems) {
            await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
        }
        console.error('Failed to process KHQR checkout:', err);
        await ctx.reply(t.checkout_failed.replace('{error}', err.message), getMainMenu(lang));
        await ctx.answerCbQuery();
    }
});

bot.action(/check_payment_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;

    const order = await Order.findOne({ orderId }).populate('user');
    if (!order) return ctx.answerCbQuery(t.order_not_found, { show_alert: true });

    if (order.status !== 'pending_payment') {
        if (order.status === 'pending' || order.status === 'completed' || order.status === 'shipping') {
            try {
                await ctx.deleteMessage();
            } catch (e) {}
            await ctx.replyWithMarkdown(t.payment_success.replace('{orderId}', order.orderId), getMainMenu(lang));
            return ctx.answerCbQuery(t.payment_success_popup, { show_alert: true });
        } else {
            return ctx.answerCbQuery(t.status_already.replace('{status}', order.status.toUpperCase()), { show_alert: true });
        }
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
            const updatedOrder = await Order.findOneAndUpdate(
                { orderId, status: 'pending_payment' },
                { status: 'pending', paymentStatus: 'paid' },
                { new: true }
            );

            if (updatedOrder) {
                await ctx.replyWithMarkdown(t.payment_success.replace('{orderId}', order.orderId), getMainMenu(lang));
                try {
                    await ctx.deleteMessage();
                } catch (e) {}
            }

            await ctx.answerCbQuery(t.payment_success_popup, { show_alert: true });
        } else {
            await ctx.answerCbQuery(t.payment_pending_popup, { show_alert: true });
        }
    } catch (err) {
        console.error('Error verifying payment:', err.response ? err.response.data : err.message);
        const status = err.response ? err.response.status : null;
        if (status === 502 || status === 503 || status === 504 || status === 500 || !err.response) {
            await ctx.answerCbQuery(t.payment_pending_popup, { show_alert: true });
        } else {
            await ctx.answerCbQuery(t.payment_failed_popup, { show_alert: true });
        }
    }
});

bot.action(/cancel_payment_(.+)/, async (ctx) => {
    const orderId = ctx.match[1];
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;

    const order = await Order.findOne({ orderId });
    if (!order) return ctx.answerCbQuery(t.order_not_found);

    if (order.status === 'pending_payment') {
        // Restore stock
        for (let item of order.items) {
            await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
        }
        order.status = 'cancelled';
        await order.save();
        await ctx.reply(t.order_cancelled.replace('{orderId}', order.orderId), getMainMenu(lang));
        try {
            await ctx.deleteMessage();
        } catch (e) {}
    } else {
        await ctx.reply(t.order_cannot_cancel);
    }
    await ctx.answerCbQuery();
});

bot.action('cancel_order', async (ctx) => {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    ctx.session = ctx.session || {};
    ctx.session.state = null;
    ctx.session.checkoutData = null;
    await ctx.reply(lang === 'km' ? '❌ ការបញ្ជាទិញត្រូវបានបោះបង់។' : '❌ Order cancelled.', getMainMenu(lang));
    await ctx.answerCbQuery();
});

// --- SEARCH ---
bot.hears(['🔎 Search', '🔎 ស្វែងរក'], async (ctx) => {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    ctx.session = ctx.session || {};
    ctx.session.state = 'search';
    await ctx.reply(t.search_prompt);
});

// --- ORDERS ---
bot.hears(['📦 My Orders', '📦 ការបញ្ជាទិញរបស់ខ្ញុំ'], async (ctx) => {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    const orders = await Order.find({ user: user._id }).populate('items.product').sort({ createdAt: -1 });

    if (orders.length === 0) {
        return ctx.reply(t.no_orders);
    }

    let msg = t.orders_title;
    for (let o of orders) {
        let itemList = '';
        o.items.forEach((item, index) => {
            const prodName = item.product ? item.product.name : t.deleted_product;
            itemList += `  • ${prodName} (x${item.quantity}) - $${item.price * item.quantity}\n`;
        });
        msg += `🆔 *${t.order_details_id}:* \`${o.orderId || o._id}\`\n📋 *${t.order_details_products}:*\n${itemList}💰 *${t.order_details_total}:* $${o.totalPrice}\n⚡ *${t.order_details_status}:* ${o.status.toUpperCase()}\n📅 *${t.order_details_date}:* ${o.createdAt.toDateString()}\n───────────────────\n\n`;
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
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const product = await Product.findByIdAndDelete(productId);
    if (product) {
        await ctx.reply(`✅ Product "${product.name}" deleted successfully.`, getMainMenu(lang));
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
    await ctx.reply(`Order status updated to *${newStatus.toUpperCase()}*`);

    // Notify customer
    try {
        const user = await User.findById(order.user);
        if (user) {
            const lang = user.language || 'en';
            let notification = '';
            if (newStatus === 'pending' && oldStatus === 'pending_payment') {
                notification = lang === 'km' 
                    ? `🎉 *ការទូទាត់ជោគជ័យ!*\nការបញ្ជាទិញរបស់អ្នក \`${order.orderId}\` ត្រូវបានបញ្ជាក់។`
                    : `🎉 *Payment Successful!*\nYour order \`${order.orderId}\` has been confirmed.`;
            } else if (newStatus === 'shipping') {
                notification = lang === 'km'
                    ? `🚚 ការបញ្ជាទិញរបស់អ្នក \`${order.orderId}\` ត្រូវបានដឹកជញ្ជូនហើយ!`
                    : `🚚 Your order \`${order.orderId}\` has been shipped!`;
            } else if (newStatus === 'completed') {
                notification = lang === 'km'
                    ? `✅ ការបញ្ជាទិញរបស់អ្នក \`${order.orderId}\` ត្រូវបានបញ្ចប់! សូមអរគុណសម្រាប់ការទិញទំនិញជាមួយយើង។`
                    : `✅ Your order \`${order.orderId}\` is completed! Thank you for shopping with us.`;
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
    const lang = user.language || 'en';
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
        return ctx.reply(`✅ Product "${prod.name}" added successfully with image!`, getMainMenu(lang));
    }
});

// --- GENERAL TEXT HANDLER (FOR STATES) ---
bot.on('text', async (ctx) => {
    const user = await getUser(ctx);
    const lang = user.language || 'en';
    const t = translations[lang] || translations.en;
    ctx.session = ctx.session || {};
    const state = ctx.session.state;

    // Search logic
    if (state === 'search') {
        const query = ctx.message.text;
        const products = await Product.find({ name: { $regex: query, $options: 'i' } });
        ctx.session.state = null;

        if (products.length === 0) {
            return ctx.reply(t.no_products_search, getMainMenu(lang));
        }

        const buttons = products.map(p => [Markup.button.callback(`${p.name} - $${p.price}`, `prod_${p._id}`)]);
        return ctx.reply(t.search_results.replace('{query}', query), Markup.inlineKeyboard(buttons));
    }

    // Checkout Logic
    if (state === 'checkout_phone') {
        const phone = ctx.message.text.trim();
        // Validate phone: only numbers, 9-12 digits
        const phoneRegex = /^\d{9,12}$/;
        if (!phoneRegex.test(phone)) {
            return ctx.reply(t.invalid_phone, Markup.inlineKeyboard([
                [Markup.button.callback(t.back_cart, 'show_cart')]
            ]));
        }

        ctx.session.checkoutData = { phone };
        ctx.session.state = 'checkout_address';
        return ctx.reply(t.enter_address, Markup.inlineKeyboard([
            [Markup.button.callback(t.back_phone, 'checkout')]
        ]));
    }

    if (state === 'checkout_address') {
        const address = ctx.message.text.trim();
        if (!address) {
            return ctx.reply(t.address_required, Markup.inlineKeyboard([
                [Markup.button.callback(t.back_phone, 'checkout')]
            ]));
        }

        ctx.session.checkoutData.address = address;
        ctx.session.state = 'checkout_confirm';

        // Retrieve cart info to display summary
        const cart = await Cart.findOne({ user: user._id }).populate('items.product');
        if (!cart || cart.items.length === 0) {
            ctx.session.state = null;
            return ctx.reply(t.empty_cart_proceed, getMainMenu(lang));
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

        const summary = `${t.order_summary}

📱 ${t.summary_phone}: ${ctx.session.checkoutData.phone}
🏠 ${t.summary_address}: ${address}

🛒 ${t.summary_items}:
${itemsList}
💰 ${t.summary_total}: $${total.toFixed(2)}

${lang === 'km' ? 'សូមចុចប៊ូតុងខាងក្រោមដើម្បីទូទាត់ប្រាក់៖' : 'Please click the button below to complete payment:'}`;

        return ctx.replyWithMarkdown(summary, Markup.inlineKeyboard([
            [
                Markup.button.callback(t.pay_now_btn, 'pay_now'),
                Markup.button.callback(t.cancel_btn, 'cancel_order')
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
            return ctx.reply(`✅ Product "${prod.name}" added successfully!`, getMainMenu(lang));
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
        return ctx.reply('✅ Product price updated successfully!', getMainMenu(lang));
    }

    if (state === 'admin_edit_stock' && user.isAdmin) {
        const stock = parseInt(ctx.message.text);
        if (isNaN(stock)) {
            return ctx.reply('Invalid number. Please enter a valid stock level:');
        }
        await Product.findByIdAndUpdate(ctx.session.editProductId, { stock });
        ctx.session.state = null;
        ctx.session.editProductId = null;
        return ctx.reply('✅ Product stock updated successfully!', getMainMenu(lang));
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
                const lang = order.user.language || 'en';
                const t = translations[lang] || translations.en;
                await bot.telegram.sendMessage(
                    order.user.telegramId, 
                    t.payment_success.replace('{orderId}', order.orderId),
                    { parse_mode: 'Markdown', ...getMainMenu(lang) }
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
