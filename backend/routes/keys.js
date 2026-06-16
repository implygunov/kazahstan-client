const { Router } = require('express');
const { data, save, nextId } = require('../database');
const { authMiddleware, adminOnly, logAction } = require('../middleware');

const router = Router();

router.post('/keys/activate', authMiddleware, (req, res) => {
  const { code } = req.body;
  const key = data.keys.find(k => k.code === code && !k.activated_by);
  if (!key) return res.status(400).json({ error: 'invalid_key' });
  key.activated_by = req.user.id;
  key.activated_at = new Date().toISOString();
  const user = data.users.find(u => u.id === req.user.id);
  if (user) {
    if (key.days) {
      const until = new Date();
      until.setDate(until.getDate() + key.days);
      user.subscription_until = until.toISOString();
    } else {
      user.premium_until = new Date('2099-12-31').toISOString();
    }
    user.role = key.role || 'BETA';
  }
  save();
  logAction('key_activate', `key:${code}`, `uid:${req.user.id}`, req.user);
  res.json({ ok: true });
});

router.post('/keys/generate', authMiddleware, adminOnly, (req, res) => {
  const { role, days, count } = req.body;
  const num = parseInt(count) || 1;
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const keys = [];
  for (let i = 0; i < num; i++) {
    let code = 'KZ-';
    for (let j = 0; j < 12; j++) code += chars[Math.floor(Math.random() * chars.length)];
    const key = { id: nextId('keys'), code, role: role || 'BETA', days: days ? parseInt(days) : null, activated_by: null, activated_at: null, created_at: new Date().toISOString() };
    data.keys.push(key);
    keys.push(key);
  }
  save();
  logAction('key_generate', `count:${num}`, `role:${role},days:${days || 'lifetime'}`, req.user);
  res.json({ keys });
});

module.exports = router;
