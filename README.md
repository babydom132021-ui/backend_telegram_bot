# E-commerce Telegram Bot

This is a fully functional E-commerce chatbot built with Node.js, Express, Telegraf, and MongoDB.

## Project Structure

```
telegramebot-node/
├── index.js          # Main entry point (Bot logic + Express server)
├── package.json      # Dependencies
├── .env              # Environment variables
└── models/           # Mongoose Database Models
    ├── User.js       # Stores Telegram user info and admin state
    ├── Product.js    # Product details (name, price, stock, category)
    ├── Order.js      # Stores checkout details (address, items, phone)
    └── Cart.js       # Temporary user cart
```

## Features Implemented
1. **User Registration:** Implicit login based on the user's Telegram ID. First-time users are saved to the database automatically.
2. **Product Browsing:** Click **🛍️ Shop Products** to browse categories. Products are dynamically generated based on DB items.
3. **Product Details & Cart:** View product details (description, price, stock). Click **🛒 Add to Cart** to add an item. The stock dictates whether an item is available.
4. **My Cart:** View your cart items, total price, and options to clear the cart, remove an item, or proceed to checkout.
5. **Checkout Flow:** Interactive session asking for your phone number and delivery address. Upon completion, saves an `Order` and clears the cart, adjusting product stocks.
6. **My Orders:** Users can view their past orders, total price, and delivery status.
7. **Admin Panel:** Admins can view recent orders and add new products directly through the bot via conversational steps.
8. **Express Server:** An express server runs alongside the bot so you can easily host it on platforms like Render, Railway, or Heroku that require a web port to bind to.

## How to Run Locally

1. **Start MongoDB:** Ensure you have a local MongoDB server running on port `27017` (or change the `MONGO_URI` in `.env`).
2. **Start the Bot:**
   Run the following command in the terminal inside `c:\laragon\www\project\telegramebot-node`:
   ```bash
   node index.js
   ```
3. **Test the Bot:**
   - Open Telegram and search for your bot.
   - Send `/start` to see the main menu.
   - Send `/adminsecret` to make yourself an admin, unlocking the "⚙️ Admin Panel" and allowing you to add products to the database!
