const { Router } = require('express');
const crypto = require('crypto');
const { data, save, nextId } = require('../database');
const { authMiddleware, adminOnly, logAction } = require('../middleware');
const config = require('../config');

const router = Router();

function ensureOrders() {
  if (!data.orders) data.orders = [];
  if (data.sequences.orders === undefined) data.sequences.orders = 0;
}

function genKeyCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'KZ-';
  for (let j = 0; j < 12; j++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Автовыдача: генерит ключ под тариф заказа и сразу активирует его на покупателя.
// Идемпотентно — повторный вызов для уже выданного заказа ничего не делает.
function issueKeyForOrder(order, actor) {
  if (order.issued_key) return order.issued_key;

  const role = order.role || 'BETA';
  const days = order.days ? parseInt(order.days) : null;

  const key = {
    id: nextId('keys'),
    code: genKeyCode(),
    role,
    days,
    activated_by: order.user_id,
    activated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  data.keys.push(key);

  // Активируем подписку/премиум на пользователя (как в /keys/activate).
  const user = data.users.find(u => u.id === order.user_id);
  if (user) {
    if (days) {
      const until = new Date();
      until.setDate(until.getDate() + days);
      user.subscription_until = until.toISOString();
    } else {
      user.premium_until = new Date('2099-12-31').toISOString();
    }
    user.role = role;
  }

  order.issued_key = key.code;
  save();
  logAction('key_issue', `order:${order.id}`, `key:${key.code},role:${role},days:${days || 'lifetime'}`, actor || { username: 'system', id: order.user_id, role: 'SYSTEM' });
  return key.code;
}

// --- Способ 1: CryptoBot (Crypto Pay API) ---
router.post('/payments/cryptobot/create', authMiddleware, async (req, res) => {
  if (!config.CRYPTOBOT_TOKEN) return res.status(503).json({ error: 'cryptobot_not_configured' });
  const amountRub = Number(req.body.amountRub);
  if (!amountRub || amountRub <= 0) return res.status(400).json({ error: 'invalid_amount' });

  const amountAsset = (amountRub / (config.RUB_PER_ASSET || 1)).toFixed(2);
  ensureOrders();
  const order = {
    id: nextId('orders'),
    user_id: req.user.id,
    method: 'cryptobot',
    amount_rub: amountRub,
    asset: config.CRYPTOBOT_ASSET,
    amount_asset: amountAsset,
    status: 'pending',
    invoice_id: null,
    comment_code: null,
    role: req.body.role || 'BETA',
    days: req.body.days ? parseInt(req.body.days) : null,
    issued_key: null,
    created_at: new Date().toISOString(),
    paid_at: null,
  };

  try {
    const r = await fetch(`${config.CRYPTOBOT_API}/createInvoice`, {
      method: 'POST',
      headers: {
        'Crypto-Pay-API-Token': config.CRYPTOBOT_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        asset: config.CRYPTOBOT_ASSET,
        amount: amountAsset,
        description: `Kazahstan Client — заказ #${order.id}`,
        payload: String(order.id),
      }),
    });
    const j = await r.json();
    if (!j.ok) return res.status(502).json({ error: 'cryptobot_error', detail: j.error || null });

    order.invoice_id = String(j.result.invoice_id);
    data.orders.push(order);
    save();
    logAction('payment_create', `order:${order.id}`, 'cryptobot', req.user);
    res.json({
      orderId: order.id,
      payUrl: j.result.pay_url || j.result.bot_invoice_url,
      asset: config.CRYPTOBOT_ASSET,
      amount: amountAsset,
    });
  } catch (e) {
    res.status(502).json({ error: 'cryptobot_unreachable' });
  }
});

// Проверка статуса инвойса CryptoBot. При оплате — paid + автовыдача ключа.
router.get('/payments/cryptobot/status/:orderId', authMiddleware, async (req, res) => {
  if (!config.CRYPTOBOT_TOKEN) return res.status(503).json({ error: 'cryptobot_not_configured' });
  ensureOrders();
  const order = data.orders.find(o => o.id === Number(req.params.orderId) && o.user_id === req.user.id);
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  if (order.status === 'paid') return res.json({ status: 'paid', orderId: order.id, key: order.issued_key });

  try {
    const r = await fetch(`${config.CRYPTOBOT_API}/getInvoices?invoice_ids=${order.invoice_id}`, {
      headers: { 'Crypto-Pay-API-Token': config.CRYPTOBOT_TOKEN },
    });
    const j = await r.json();
    const inv = j.ok && j.result.items && j.result.items[0];
    if (inv && inv.status === 'paid') {
      order.status = 'paid';
      order.paid_at = new Date().toISOString();
      const key = issueKeyForOrder(order, req.user);
      logAction('payment_paid', `order:${order.id}`, 'cryptobot', req.user);
      return res.json({ status: 'paid', orderId: order.id, key });
    }
    res.json({ status: order.status, orderId: order.id });
  } catch (e) {
    res.status(502).json({ error: 'cryptobot_unreachable' });
  }
});

// --- Способ 2: СБП (перевод по номеру телефона, ручное подтверждение) ---
router.post('/payments/sbp/create', authMiddleware, (req, res) => {
  if (!config.SBP_PHONE) return res.status(503).json({ error: 'sbp_not_configured' });
  const amountRub = Number(req.body.amountRub);
  if (!amountRub || amountRub <= 0) return res.status(400).json({ error: 'invalid_amount' });

  ensureOrders();
  const order = {
    id: nextId('orders'),
    user_id: req.user.id,
    method: 'sbp',
    amount_rub: amountRub,
    asset: null,
    amount_asset: null,
    status: 'pending',
    invoice_id: null,
    comment_code: 'KZ' + crypto.randomBytes(3).toString('hex').toUpperCase(),
    role: req.body.role || 'BETA',
    days: req.body.days ? parseInt(req.body.days) : null,
    issued_key: null,
    created_at: new Date().toISOString(),
    paid_at: null,
  };
  data.orders.push(order);
  save();
  logAction('payment_create', `order:${order.id}`, 'sbp', req.user);

  res.json({
    orderId: order.id,
    amountRub,
    phone: config.SBP_PHONE,
    bank: config.SBP_BANK,
    receiver: config.SBP_RECEIVER,
    comment: order.comment_code,
    note: 'Переведите точную сумму по СБП и укажите код в комментарии к платежу.',
  });
});

// Подтверждение СБП-оплаты админом -> paid + автовыдача ключа.
router.post('/payments/sbp/confirm', authMiddleware, adminOnly, (req, res) => {
  ensureOrders();
  const order = data.orders.find(o => o.id === Number(req.body.orderId) && o.method === 'sbp');
  if (!order) return res.status(404).json({ error: 'order_not_found' });
  if (order.status === 'paid') return res.json({ status: 'paid', orderId: order.id, key: order.issued_key });

  order.status = 'paid';
  order.paid_at = new Date().toISOString();
  const key = issueKeyForOrder(order, req.user);
  logAction('payment_paid', `order:${order.id}`, 'sbp', req.user);
  res.json({ status: 'paid', orderId: order.id, key });
});

// Заказы текущего пользователя (с выданными ключами).
router.get('/payments/my', authMiddleware, (req, res) => {
  ensureOrders();
  const orders = data.orders
    .filter(o => o.user_id === req.user.id)
    .map(o => ({ id: o.id, method: o.method, amount_rub: o.amount_rub, status: o.status, role: o.role, days: o.days, key: o.issued_key, created_at: o.created_at, paid_at: o.paid_at }));
  res.json({ orders });
});

// Список всех заказов для админки.
router.get('/admin/orders', authMiddleware, adminOnly, (req, res) => {
  ensureOrders();
  const orders = data.orders.map(o => {
    const u = data.users.find(x => x.id === o.user_id);
    return { ...o, username: u ? u.username : 'unknown' };
  });
  res.json({ orders });
});

module.exports = router;
