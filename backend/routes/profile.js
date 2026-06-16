const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { data, save, nextId } = require('../database');
const { authMiddleware, logAction } = require('../middleware');

const router = Router();

router.post('/change-email', authMiddleware, (req, res) => {
  const { currentPassword, newEmail } = req.body;
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(400).json({ error: 'wrong_password' });
  if (data.users.find(u => u.email === newEmail && u.id !== user.id)) return res.status(400).json({ error: 'email_exists' });
  user.email = newEmail;
  save();
  res.json({ ok: true });
});

router.post('/change-password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  if (!bcrypt.compareSync(currentPassword, user.password)) return res.status(400).json({ error: 'wrong_password' });
  user.password = bcrypt.hashSync(newPassword, 10);
  save();
  res.json({ ok: true });
});

router.post('/profile/ram', authMiddleware, (req, res) => {
  const { ram_mb } = req.body;
  const user = data.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: 'user_not_found' });
  user.ram = parseInt(ram_mb) || 2048;
  save();
  logAction('ram_set', `uid:${user.id}`, `ram:${user.ram}`, req.user);
  res.json({ ok: true });
});

module.exports = router;
