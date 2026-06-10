const { createCanvas, loadImage } = require('canvas');

/**
 * Generates a styled order receipt image as a PNG buffer.
 *
 * @param {Object} data
 * @param {string} data.orderId         - e.g. "ORD-2026-0001"
 * @param {Object} data.user            - { firstName, lastName, username }
 * @param {string} data.phone
 * @param {string} data.address
 * @param {Array}  data.items           - [{ name, quantity, price }]
 * @param {number} data.totalPrice
 * @param {string} data.status          - e.g. "pending_payment"
 * @param {string} data.paymentStatus   - e.g. "pending"
 * @param {Buffer|null} data.qrBuffer   - QR code image buffer (optional)
 * @param {Date}   data.createdAt
 * @returns {Promise<Buffer>} PNG image buffer
 */
async function generateReceipt(data) {
    const W = 900;
    const PADDING = 36;
    const COL_LEFT = PADDING;
    const COL_RIGHT = W / 2 + 10;
    const COL_WIDTH = W / 2 - PADDING - 10;

    // ── Estimate height ──────────────────────────────────────────────
    const ITEM_ROW_H = 54;
    const ITEM_SECTION_H = Math.max(data.items.length * ITEM_ROW_H + 100, 180);
    const H = 160 + 260 + ITEM_SECTION_H + 180 + 80; // header + customer + items + payment/status + footer

    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // ── Helpers ──────────────────────────────────────────────────────
    const hex = (color) => color;

    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function badge(ctx, text, x, y, bgColor, textColor = '#ffffff', fontSize = 14) {
        ctx.font = `bold ${fontSize}px Arial`;
        const tw = ctx.measureText(text).width;
        const bw = tw + 22;
        const bh = fontSize + 14;
        roundRect(ctx, x, y - bh / 2, bw, bh, bh / 2);
        ctx.fillStyle = bgColor;
        ctx.fill();
        ctx.fillStyle = textColor;
        ctx.textAlign = 'left';
        ctx.fillText(text, x + 11, y + fontSize / 2 - 1);
        return bw;
    }

    function sectionHeader(ctx, label, x, y, width) {
        roundRect(ctx, x, y, width, 28, 5);
        ctx.fillStyle = '#1a2e5e';
        ctx.fill();
        ctx.font = 'bold 13px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(label, x + 12, y + 19);
    }

    function divider(ctx, y) {
        ctx.beginPath();
        ctx.setLineDash([6, 4]);
        ctx.moveTo(PADDING, y);
        ctx.lineTo(W - PADDING, y);
        ctx.strokeStyle = '#d0d9ec';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // ── Background ───────────────────────────────────────────────────
    ctx.fillStyle = '#f5f7fc';
    ctx.fillRect(0, 0, W, H);

    // White card
    roundRect(ctx, 16, 16, W - 32, H - 32, 16);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,80,0.10)';
    ctx.shadowBlur = 24;
    ctx.fill();
    ctx.shadowBlur = 0;

    // ── Header ───────────────────────────────────────────────────────
    const HEADER_H = 110;
    roundRect(ctx, 16, 16, W - 32, HEADER_H, 16);
    ctx.fillStyle = '#1a2e5e';
    ctx.fill();

    // Shop icon circle
    ctx.beginPath();
    ctx.arc(72, 71, 32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();

    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('🛍', 72, 82);

    // Shop name
    ctx.font = 'bold 26px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.fillText('MY SHOP', 118, 62);
    ctx.font = '13px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('YOUR TRUSTED STORE', 120, 82);

    // Title
    ctx.font = 'bold 30px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText('ORDER RECEIPT', W / 2, 60);
    ctx.font = '13px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('Thank you for your order!', W / 2, 82);

    // Order ID box
    const orderBoxW = 190;
    roundRect(ctx, W - 16 - orderBoxW - 16, 30, orderBoxW + 16, HEADER_H - 60, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fill();
    ctx.font = '11px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.textAlign = 'left';
    ctx.fillText('ORDER ID', W - 16 - orderBoxW, 58);
    ctx.font = 'bold 17px Arial';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(data.orderId, W - 16 - orderBoxW, 80);

    let curY = 16 + HEADER_H + 20;

    // ── Two column layout ────────────────────────────────────────────
    const TWO_COL_TOP = curY;

    // LEFT: Customer Information
    sectionHeader(ctx, 'CUSTOMER INFORMATION', COL_LEFT, curY, COL_WIDTH);
    curY += 38;

    const customerFields = [
        { icon: '👤', label: 'Name', value: `${data.user.firstName || ''} ${data.user.lastName || ''}`.trim() || data.user.username || 'N/A' },
        { icon: '📞', label: 'Phone', value: data.phone || 'N/A' },
        { icon: '📍', label: 'Address', value: data.address || 'N/A' },
        { icon: '📅', label: 'Order Date', value: (data.createdAt || new Date()).toLocaleString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
    ];

    for (const f of customerFields) {
        ctx.font = '13px Arial';
        ctx.fillStyle = '#888';
        ctx.textAlign = 'left';
        ctx.fillText(f.icon + '  ' + f.label, COL_LEFT + 8, curY);
        ctx.fillStyle = '#1a2e5e';
        ctx.font = 'bold 13px Arial';
        // wrap long address
        const maxW = COL_WIDTH - 120;
        const valueX = COL_LEFT + 120;
        ctx.fillText(':', valueX - 10, curY);
        const lines = wrapText(ctx, f.value, maxW);
        lines.forEach((line, i) => {
            ctx.fillText(line, valueX, curY + i * 18);
        });
        curY += 18 * lines.length + 8;
    }

    // RIGHT: Order Summary
    let rightY = TWO_COL_TOP;
    sectionHeader(ctx, 'ORDER SUMMARY', COL_RIGHT, rightY, COL_WIDTH);
    rightY += 38;

    // Table headers
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    ctx.fillText('ITEM', COL_RIGHT + 4, rightY);
    ctx.textAlign = 'center';
    ctx.fillText('QTY', COL_RIGHT + COL_WIDTH - 150, rightY);
    ctx.textAlign = 'right';
    ctx.fillText('PRICE', COL_RIGHT + COL_WIDTH - 70, rightY);
    ctx.fillText('TOTAL', COL_RIGHT + COL_WIDTH, rightY);
    rightY += 6;

    divider(ctx, rightY);
    rightY += 12;

    let subtotal = 0;
    for (const item of data.items) {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;

        ctx.font = 'bold 13px Arial';
        ctx.fillStyle = '#1a2e5e';
        ctx.textAlign = 'left';
        ctx.fillText(item.name, COL_RIGHT + 4, rightY);
        ctx.font = '11px Arial';
        ctx.fillStyle = '#888';

        ctx.font = '13px Arial';
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.fillText(String(item.quantity), COL_RIGHT + COL_WIDTH - 150, rightY);
        ctx.textAlign = 'right';
        ctx.fillText(`$${item.price.toFixed(2)}`, COL_RIGHT + COL_WIDTH - 70, rightY);
        ctx.fillText(`$${itemTotal.toFixed(2)}`, COL_RIGHT + COL_WIDTH, rightY);
        rightY += ITEM_ROW_H;
    }

    divider(ctx, rightY);
    rightY += 16;

    // Subtotal, Shipping, Total
    ctx.font = '13px Arial';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    ctx.fillText('Subtotal', COL_RIGHT + 4, rightY);
    ctx.textAlign = 'right';
    ctx.fillText(`$${subtotal.toFixed(2)}`, COL_RIGHT + COL_WIDTH, rightY);
    rightY += 24;

    const shipping = 3;
    ctx.fillText('Shipping Fee', COL_RIGHT + 4, rightY);
    ctx.textAlign = 'right';
    ctx.fillText(`$${shipping.toFixed(2)}`, COL_RIGHT + COL_WIDTH, rightY);
    ctx.textAlign = 'left';
    rightY += 12;

    divider(ctx, rightY);
    rightY += 16;

    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = '#1a2e5e';
    ctx.textAlign = 'left';
    ctx.fillText('TOTAL', COL_RIGHT + 4, rightY);
    ctx.textAlign = 'right';
    ctx.fillText(`$${data.totalPrice.toFixed(2)}`, COL_RIGHT + COL_WIDTH, rightY);

    // Move curY below the taller column
    curY = Math.max(curY, rightY) + 24;
    divider(ctx, curY);
    curY += 20;

    // ── Bottom Section: Payment | Status | Notes ──────────────────────
    const BOT_COL_W = (W - 2 * PADDING - 20) / 2;

    // LEFT: Payment Method (QR)
    sectionHeader(ctx, 'PAYMENT METHOD', COL_LEFT, curY, BOT_COL_W);
    curY += 38;

    const PAYMENT_BOX_TOP = curY;
    roundRect(ctx, COL_LEFT, curY, BOT_COL_W, 130, 10);
    ctx.fillStyle = '#f0f4ff';
    ctx.fill();
    ctx.strokeStyle = '#d0d9ec';
    ctx.lineWidth = 1;
    ctx.stroke();

    if (data.qrBuffer) {
        try {
            const qrImg = await loadImage(data.qrBuffer);
            ctx.drawImage(qrImg, W / 2 - 120, curY + 8, 110, 110);
        } catch (e) { /* skip if qr load fails */ }
    }

    ctx.font = 'bold 15px Arial';
    ctx.fillStyle = '#27ae60';
    ctx.textAlign = 'left';
    ctx.fillText('KHQR', COL_LEFT + 14, curY + 30);
    ctx.font = '11px Arial';
    ctx.fillStyle = '#555';
    ctx.fillText('Scan to Pay', COL_LEFT + 14, curY + 47);

    ctx.font = '11px Arial';
    ctx.fillStyle = '#555';
    ctx.fillText('Scan the QR code', COL_LEFT + 14, curY + 68);
    ctx.fillText('to complete payment', COL_LEFT + 14, curY + 84);

    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = '#888';
    ctx.fillText('Amount to Pay', COL_LEFT + 14, curY + 104);

    ctx.font = 'bold 22px Arial';
    ctx.fillStyle = '#27ae60';
    ctx.fillText(`$${data.totalPrice.toFixed(2)}`, COL_LEFT + 14, curY + 124);

    // Expiry note
    const PAYMENT_BOX_BOT = PAYMENT_BOX_TOP + 130 + 14;
    ctx.font = '11px Arial';
    ctx.fillStyle = '#e74c3c';
    ctx.textAlign = 'left';
    ctx.fillText('⏳ QR will expire in 10 minutes.', COL_LEFT, PAYMENT_BOX_BOT);

    // RIGHT: Order Status + Notes
    let rightBotY = curY;
    sectionHeader(ctx, 'ORDER STATUS', COL_RIGHT, rightBotY - 38, BOT_COL_W);

    roundRect(ctx, COL_RIGHT, rightBotY, BOT_COL_W, 70, 10);
    ctx.fillStyle = '#f0f4ff';
    ctx.fill();
    ctx.strokeStyle = '#d0d9ec';
    ctx.lineWidth = 1;
    ctx.stroke();

    const statusColor = data.status === 'pending_payment' ? '#e67e22' :
        data.status === 'pending' ? '#27ae60' :
        data.status === 'shipping' ? '#2980b9' :
        data.status === 'completed' ? '#27ae60' : '#e74c3c';

    const statusLabel = data.status === 'pending_payment' ? 'Pending Payment' :
        data.status === 'pending' ? 'Confirmed' :
        data.status === 'shipping' ? 'Shipped' :
        data.status === 'completed' ? 'Completed' : data.status;

    const payLabel = data.paymentStatus === 'paid' ? 'Paid ✅' : 'Awaiting Confirmation';

    ctx.font = '13px Arial';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    ctx.fillText('Status', COL_RIGHT + 14, rightBotY + 28);
    ctx.fillText('Payment', COL_RIGHT + 14, rightBotY + 52);
    ctx.fillText(':', COL_RIGHT + 100, rightBotY + 28);
    ctx.fillText(':', COL_RIGHT + 100, rightBotY + 52);
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = statusColor;
    ctx.fillText(statusLabel, COL_RIGHT + 112, rightBotY + 28);
    ctx.fillStyle = '#555';
    ctx.fillText(payLabel, COL_RIGHT + 112, rightBotY + 52);

    rightBotY += 80 + 10;

    sectionHeader(ctx, 'NOTES', COL_RIGHT, rightBotY, BOT_COL_W);
    rightBotY += 38;

    ctx.font = '12px Arial';
    ctx.fillStyle = '#555';
    ctx.textAlign = 'left';
    ctx.fillText('• Please complete the payment within 10 minutes.', COL_RIGHT + 8, rightBotY);
    ctx.fillText('• If you have any questions, please contact our support.', COL_RIGHT + 8, rightBotY + 20);

    // Thank you stamp circle
    const STAMP_X = COL_RIGHT + BOT_COL_W - 56;
    const STAMP_Y = rightBotY + 30;
    ctx.beginPath();
    ctx.arc(STAMP_X, STAMP_Y, 44, 0, Math.PI * 2);
    ctx.strokeStyle = '#1a2e5e';
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 10px Arial';
    ctx.fillStyle = '#1a2e5e';
    ctx.textAlign = 'center';
    ctx.fillText('THANK YOU', STAMP_X, STAMP_Y - 12);
    ctx.fillText('FOR YOUR', STAMP_X, STAMP_Y + 2);
    ctx.fillText('ORDER', STAMP_X, STAMP_Y + 16);

    // ── Footer ────────────────────────────────────────────────────────
    const FOOTER_Y = H - 16 - 50;
    roundRect(ctx, 16, FOOTER_Y, W - 32, 50, 16);
    ctx.fillStyle = '#1a2e5e';
    ctx.fill();

    ctx.font = '12px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText('📞 ' + (data.phone || '—'), PADDING + 10, FOOTER_Y + 30);
    ctx.textAlign = 'center';
    ctx.fillText('🌐 www.myshop.com.kh', W / 2, FOOTER_Y + 30);
    ctx.textAlign = 'right';
    ctx.fillText('✉ support@myshop.com.kh', W - PADDING - 10, FOOTER_Y + 30);

    // Barcode lines (decorative)
    const BAR_Y = H - 16 - 18;
    const BAR_X_START = PADDING + 10;
    const BAR_W_TOTAL = 200;
    const barWidths = [2, 1, 3, 1, 2, 1, 4, 1, 1, 2, 3, 1, 2, 1, 3, 1, 2, 1, 3, 2, 1, 4];
    let bx = BAR_X_START;
    let isBlack = true;
    for (const bw of barWidths) {
        if (isBlack) {
            ctx.fillStyle = '#1a2e5e';
            ctx.fillRect(bx, BAR_Y, bw, 12);
        }
        bx += bw + 1;
        isBlack = !isBlack;
    }

    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = '#1a2e5e';
    ctx.textAlign = 'right';
    ctx.fillText('THANK YOU FOR SHOPPING WITH US! ♥', W - PADDING - 10, BAR_Y + 11);

    return canvas.toBuffer('image/png');
}

/**
 * Wraps text to fit within maxWidth. Returns array of lines.
 */
function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(' ');
    const lines = [];
    let current = '';
    for (const word of words) {
        const test = current ? current + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = word;
        } else {
            current = test;
        }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [''];
}

module.exports = { generateReceipt };
