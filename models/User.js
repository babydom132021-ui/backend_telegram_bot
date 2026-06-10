const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    firstName: String,
    lastName: String,
    username: String,
    phone: String,
    address: String,
    language: { type: String, default: 'en' },
    isAdmin: { type: Boolean, default: false }
});

module.exports = mongoose.model('User', userSchema);
