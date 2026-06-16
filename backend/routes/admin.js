const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { data, save, nextId } = require('../database');
const { authMiddleware, adminOnly, developerOnly, logAction } = require('../middleware');

const router = Router();

router.get('/admin/users', authMiddleware, adminOnly, (req, res) => {
  let users = data.users;
  if (req.query.role) users = users.filter(u => u.role === req.query.role);
  res.json({ users: users.map(u => ({ id: u.id, uid: String(u.id), username: u.username, email: u.email, role: u.role, rml: u.rml === 1 || u.rml === true, hwid: u.hwid, ram: u.ram, subscription_until: u.subscription_until, premium_until: u.premium_until, created_at: u.created_at })) });
});

router.get('/admin/stats', authMiddleware, adminOnly, (req, res) => {
  data.stats.users = data.users.length;
  save();
  res.json({ users: data.stats.users || 0, revenue: 0, downloads: 0 });
});

router.get('/admin/keys', authMiddleware, adminOnly, (req, res) => {
  res.json({ keys: data.keys });
});

router.post('/admin/keys/clear', authMiddleware, developerOnly, (req, res) => {
  data.keys = [];
  save();
  logAction('key_clear', 'all', '', req.user);
  res.json({ ok: true });
});

router.get('/admin/journal', authMiddleware, adminOnly, (req, res) => {
  res.json({ actions: data.journal });
});

router.post('/admin/journal/clear', authMiddleware, developerOnly, (req, res) => {
  data.journal = [];
  save();
  res.json({ ok: true });
});

router.get('/admin/promocodes', authMiddleware, adminOnly, (req, res) => {
  res.json({ promos: data.promocodes });
});

router.post('/admin/promocodes', authMiddleware, adminOnly, (req, res) => {
  const { code, discountPercent } = req.body;
  if (data.promocodes.find(p => p.code === code)) return res.status(400).json({ error: 'promo_exists' });
  const promo = { id: nextId('promocodes'), code, discount_percent: parseInt(discountPercent) || 10, created_at: new Date().toISOString() };
  data.promocodes.push(promo);
  save();
  logAction('promo_create', `promo:${code}`, `discount:${discountPercent}`, req.user);
  res.json({ ok: true });
});

router.post('/admin/promocodes/delete', authMiddleware, adminOnly, (req, res) => {
  const { promoId } = req.body;
  const idx = data.promocodes.findIndex(p => p.id === parseInt(promoId));
  if (idx === -1) return res.status(404).json({ error: 'not_found' });
  const removed = data.promocodes.splice(idx, 1)[0];
  save();
  logAction('promo_delete', `promo:${removed.code}`, '', req.user);
  res.json({ ok: true });
});

router.post('/admin/ban', authMiddleware, adminOnly, (req, res) => {
  const { userId, banned } = req.body;
  const user = data.users.find(u => u.id === parseInt(userId));
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  if (user.role === 'DEVELOPER') return res.status(403).json({ error: 'forbidden' });
  user.role = banned ? 'BANNED' : 'DEFAULT';
  save();
  logAction(banned ? 'ban' : 'unban', `uid:${userId}`, `username:${user.username}`, req.user);
  res.json({ ok: true });
});

router.post('/admin/role', authMiddleware, adminOnly, (req, res) => {
  const { userId, role } = req.body;
  const user = data.users.find(u => u.id === parseInt(userId));
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  if (user.role === 'DEVELOPER' && req.dbUser.role !== 'DEVELOPER') return res.status(403).json({ error: 'forbidden' });
  user.role = role;
  save();
  logAction('role_set', `uid:${userId}`, `role:${role}`, req.user);
  res.json({ ok: true });
});

router.post('/admin/subscription/remove', authMiddleware, adminOnly, (req, res) => {
  const { userId } = req.body;
  const user = data.users.find(u => u.id === parseInt(userId));
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  user.subscription_until = null;
  user.premium_until = null;
  save();
  logAction('sub_remove', `uid:${userId}`, '', req.user);
  res.json({ ok: true });
});

router.post('/admin/reset-password', authMiddleware, adminOnly, (req, res) => {
  const { userId } = req.body;
  const user = data.users.find(u => u.id === parseInt(userId));
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  user.password = bcrypt.hashSync('123456', 10);
  save();
  logAction('password_reset', `uid:${userId}`, '', req.user);
  res.json({ delivered: false });
});

router.post('/admin/reset-hwid', authMiddleware, adminOnly, (req, res) => {
  const { userId } = req.body;
  const user = data.users.find(u => u.id === parseInt(userId));
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  user.hwid = null;
  save();
  logAction('hwid_reset', `uid:${userId}`, '', req.user);
  res.json({ ok: true });
});

router.post('/admin/set-ram', authMiddleware, adminOnly, (req, res) => {
  const { userId, ram_mb } = req.body;
  const user = data.users.find(u => u.id === parseInt(userId));
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  user.ram = parseInt(ram_mb) || 2048;
  save();
  logAction('ram_set', `uid:${userId}`, `ram:${user.ram}`, req.user);
  res.json({ ok: true });
});

router.get('/admin/tickets', authMiddleware, adminOnly, (req, res) => {
  const tickets = data.tickets.map(t => {
    const u = data.users.find(u => u.id === t.user_id);
    return { ...t, username: u ? u.username : 'unknown', user_id: t.user_id };
  });
  res.json({ tickets });
});

router.post('/admin/tickets/clear', authMiddleware, developerOnly, (req, res) => {
  data.tickets = [];
  data.ticket_messages = [];
  save();
  res.json({ ok: true });
});

router.get('/admin/promocodes', authMiddleware, adminOnly, (req, res) => {
  res.json({ promos: data.promocodes });
});

router.post('/admin/rml-hwid-reset', authMiddleware, adminOnly, (req, res) => {
  const { userId } = req.body;
  const user = data.users.find(u => u.id === parseInt(userId));
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  user.rml_hwid = null;
  save();
  logAction('rml_hwid_reset', `uid:${userId}`, '', req.dbUser);
  res.json({ ok: true });
});

router.post('/admin/rml', authMiddleware, adminOnly, (req, res) => {
  const { userId, rml } = req.body;
  const user = data.users.find(u => u.id === parseInt(userId));
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  user.rml = rml ? 1 : 0;
  save();
  logAction('rml_set', `uid:${userId}`, `rml:${user.rml}`, req.dbUser);
  res.json({ ok: true });
});

router.post('/admin/autobuild', authMiddleware, adminOnly, (req, res) => {
  res.json({ ok: true, message: 'Build started' });
});

module.exports = router;
